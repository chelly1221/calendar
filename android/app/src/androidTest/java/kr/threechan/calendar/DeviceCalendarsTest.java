package kr.threechan.calendar;
import static org.junit.Assert.*;
import android.content.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.CalendarContract;
import android.provider.CalendarContract.*;
import android.database.Cursor;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import java.io.*;
import java.util.*;

/** Creates and removes only isolated LOCAL fixture calendars on a disposable debug emulator. */
@RunWith(AndroidJUnit4.class)
public class DeviceCalendarsTest {
    private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final ContentResolver resolver=context.getContentResolver();
    private DeviceCalendars calendars;
    private final List<Long> created=new ArrayList<>();
    private String source,other;
    private void shell(String command)throws Exception{try(ParcelFileDescriptor fd=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);FileInputStream in=new FileInputStream(fd.getFileDescriptor())){in.readAllBytes();}}
    private Uri adapter(Uri uri){return uri.buildUpon().appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER,"true").appendQueryParameter(Calendars.ACCOUNT_NAME,"Calendar QA").appendQueryParameter(Calendars.ACCOUNT_TYPE,"LOCAL").build();}
    private String calendar(String name,int access){
        ContentValues values=new ContentValues();values.put(Calendars.ACCOUNT_NAME,"Calendar QA");values.put(Calendars.ACCOUNT_TYPE,"LOCAL");values.put(Calendars.NAME,"qa-"+UUID.randomUUID());values.put(Calendars.CALENDAR_DISPLAY_NAME,name);values.put(Calendars.CALENDAR_COLOR,0xff4263eb);values.put(Calendars.CALENDAR_ACCESS_LEVEL,access);values.put(Calendars.OWNER_ACCOUNT,"Calendar QA");values.put(Calendars.VISIBLE,1);values.put(Calendars.SYNC_EVENTS,1);values.put(Calendars.CALENDAR_TIME_ZONE,"Asia/Seoul");
        long id=ContentUris.parseId(resolver.insert(adapter(Calendars.CONTENT_URI),values));created.add(id);return Long.toString(id);
    }
    private long event(String source,String title){
        ContentValues values=new ContentValues();values.put(Events.CALENDAR_ID,Long.parseLong(source));values.put(Events.TITLE,title);values.put(Events.DTSTART,1789113600000L);values.put(Events.DTEND,1789117200000L);values.put(Events.EVENT_TIMEZONE,"Asia/Seoul");values.put(Events.EVENT_COLOR,0xffeb4263);return ContentUris.parseId(resolver.insert(Events.CONTENT_URI,values));
    }
    @Before public void setup()throws Exception{
        assertTrue(context.getPackageName().endsWith(".debug"));
        shell("pm grant "+context.getPackageName()+" android.permission.READ_CALENDAR");shell("pm grant "+context.getPackageName()+" android.permission.WRITE_CALENDAR");
        calendars=new DeviceCalendars(context);calendars.configure(new JSONArray());source=calendar("개인 캘린더 · 검증",Calendars.CAL_ACCESS_OWNER);other=calendar("읽기 전용 · 검증",Calendars.CAL_ACCESS_READ);event(source,"기기 일정 검증");event(other,"선택하지 않은 일정");
    }
    @After public void cleanup()throws Exception{calendars.configure(new JSONArray());for(long id:created)resolver.delete(adapter(ContentUris.withAppendedId(Calendars.CONTENT_URI,id)),null,null);}
    private void select(String mode)throws Exception{calendars.configure(new JSONArray().put(new JSONObject().put("id",source).put("mode",mode)));}
    private JSONObject family()throws Exception{return calendars.scan().getJSONArray("families").getJSONObject(0);}
    private JSONObject writeInput(JSONObject family,String title)throws Exception{
        JSONObject row=new JSONObject(family.getJSONArray("records").getJSONObject(0).toString());row.put(Events.TITLE,title);
        return new JSONObject().put("source",source).put("id",family.getString("id")).put("version",family.getString("version")).put("key","device-qa-event").put("events",new JSONArray().put(row));
    }
    @Test public void onlySelectedCalendarsAreReadAndReadonlyCalendarsCannotBeWritten()throws Exception{
        assertEquals(0,calendars.scan().getJSONArray("families").length());select("read");assertEquals(1,calendars.scan().getJSONArray("families").length());
        try{calendars.write(writeInput(family(),"금지"));fail();}catch(SecurityException expected){}
        try{calendars.configure(new JSONArray().put(new JSONObject().put("id",other).put("mode","two-way")));fail();}catch(SecurityException expected){}
    }
    @Test public void updatesDetectConcurrentChangesAndDeletionPreservesOtherCalendars()throws Exception{
        select("two-way");JSONObject before=family(),input=writeInput(before,"수정된 기기 일정");assertFalse(calendars.write(input).getBoolean("conflict"));assertTrue(calendars.write(input).getBoolean("conflict"));
        assertEquals("수정된 기기 일정",family().getJSONArray("records").getJSONObject(0).getString(Events.TITLE));
        JSONObject remove=new JSONObject().put("source",source).put("id",before.getString("id")).put("version",before.getString("version"));assertTrue(calendars.remove(remove).getBoolean("conflict"));
        remove.put("version",family().getString("version"));assertFalse(calendars.remove(remove).getBoolean("conflict"));assertEquals(0,calendars.scan().getJSONArray("families").length());
        try(Cursor c=resolver.query(Events.CONTENT_URI,new String[]{Events._ID},Events.CALENDAR_ID+"=? AND "+Events.DELETED+"=0",new String[]{other},null)){assertNotNull(c);assertEquals(1,c.getCount());}
    }
    @Test public void lostInsertResponseCannotCreateDuplicateEvents()throws Exception{
        select("two-way");JSONObject input=writeInput(family(),"신규 일정");input.remove("id");input.remove("version");input.put("key","insert-qa-"+UUID.randomUUID());
        JSONObject first=calendars.write(input),second=calendars.write(input);assertFalse(first.getBoolean("conflict"));assertEquals(first.getString("id"),second.getString("id"));assertEquals(2,calendars.scan().getJSONArray("families").length());
    }
    @Test public void timezoneIncludesHistoricalAndFutureDaylightTransitions(){
        String zone=DeviceCalendars.timezone("America/New_York");assertTrue(zone.contains("TZID:America/New_York"));assertTrue(zone.contains("20260308T020000"));assertTrue(zone.contains("20261101T020000"));assertTrue(zone.contains("BEGIN:DAYLIGHT"));assertTrue(zone.contains("RDATE:"));
    }
}
