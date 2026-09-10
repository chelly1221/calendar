package kr.threechan.calendar.widget;

import android.content.Context;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public final class WidgetStore {
    private static JSONObject cached;
    private static AtomicFile file(Context c) { return new AtomicFile(new File(c.getFilesDir(), "calendar-widget-v1.json")); }
    public static synchronized JSONObject read(Context c) {
        if (cached != null) return cached;
        try { cached = new JSONObject(new String(file(c).readFully(), StandardCharsets.UTF_8)); }
        catch (Exception ignored) { cached = new JSONObject(); }
        return cached;
    }
    public static synchronized void write(Context c, JSONObject data) throws Exception {
        if (data.getInt("version") != 1 || data.getJSONArray("events").length() > 40000 ||
            data.getJSONArray("calendars").length() > 1000) throw new IllegalArgumentException("Invalid widget snapshot");
        java.time.LocalDate.parse(data.getString("rangeStart"));
        java.time.LocalDate.parse(data.getString("rangeEnd"));
        if (data.getLong("generatedAt") < read(c).optLong("generatedAt")) return;
        byte[] bytes = data.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 16 * 1024 * 1024) throw new IllegalArgumentException("Widget snapshot too large");
        AtomicFile atomic = file(c); FileOutputStream out = null;
        try { out = atomic.startWrite(); out.write(bytes); atomic.finishWrite(out); cached = data; }
        catch (Exception e) { atomic.failWrite(out); throw e; }
    }
}
