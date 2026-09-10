package kr.threechan.calendar.widget;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

public final class WidgetConfig {
    public final JSONObject values;
    public WidgetConfig(JSONObject values) { this.values = values; }
    public static SharedPreferences prefs(Context c) { return c.getSharedPreferences("calendar_widgets", Context.MODE_PRIVATE); }
    public static WidgetConfig load(Context c, int id) {
        try { return new WidgetConfig(new JSONObject(prefs(c).getString("config." + id, prefs(c).getString("defaults", "{}")))); }
        catch (Exception e) { return new WidgetConfig(new JSONObject()); }
    }
    public WidgetConfig copy() {
        try { return new WidgetConfig(new JSONObject(values.toString())); } catch (Exception e) { throw new IllegalStateException(e); }
    }
    public void set(String key, Object value) { try { values.put(key, value); } catch (Exception e) { throw new IllegalArgumentException(e); } }
    public void save(Context c, int id) { prefs(c).edit().putString(id < 0 ? "defaults" : "config." + id, values.toString()).commit(); }
    public boolean flag(String key, boolean fallback) { return values.optBoolean(key, fallback); }
    public int number(String key, int fallback, int min, int max) { return Math.max(min, Math.min(max, values.optInt(key, fallback))); }
    public String text(String key, String fallback) { return values.optString(key, fallback); }
    public boolean includes(String id) {
        if (flag("allCalendars", true)) return true;
        JSONArray ids = values.optJSONArray("calendarIds");
        if (ids != null) for (int i = 0; i < ids.length(); i++) if (id.equals(ids.optString(i))) return true;
        return false;
    }
    public Set<String> selected() {
        Set<String> result = new HashSet<>();
        JSONArray ids = values.optJSONArray("calendarIds");
        if (ids != null) for (int i=0; i<ids.length(); i++) result.add(ids.optString(i));
        return result;
    }
    public static void ensure(Context c, int id) {
        if (!prefs(c).contains("config." + id)) load(c, id).save(c, id);
    }
    public static void delete(Context c, int id) {
        prefs(c).edit().remove("config." + id).remove("month." + id).remove("navigation." + id).apply();
    }
}
