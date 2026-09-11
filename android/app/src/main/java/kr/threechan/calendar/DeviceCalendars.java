package kr.threechan.calendar;

import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import android.provider.CalendarContract.*;
import androidx.core.content.ContextCompat;
import org.json.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.zone.*;
import java.util.*;

/** Only calendars explicitly selected in this installation may be read or written. */
final class DeviceCalendars {
    static final String PREFS="device-calendars-v1";
    private final Context context;
    private final ContentResolver resolver;
    private final SharedPreferences prefs;
    static final String[] FIELDS={Events._ID,Events.CALENDAR_ID,Events.TITLE,Events.DESCRIPTION,Events.EVENT_LOCATION,Events.DTSTART,Events.DTEND,Events.DURATION,Events.ALL_DAY,Events.EVENT_TIMEZONE,Events.EVENT_END_TIMEZONE,Events.RRULE,Events.RDATE,Events.EXRULE,Events.EXDATE,Events.STATUS,Events.AVAILABILITY,Events.ACCESS_LEVEL,Events.ORIGINAL_ID,Events.ORIGINAL_INSTANCE_TIME,Events.ORIGINAL_ALL_DAY,Events.UID_2445,Events.EVENT_COLOR,Events.DELETED};
    DeviceCalendars(Context c){context=c.getApplicationContext();resolver=c.getContentResolver();prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    boolean readable(){return ContextCompat.checkSelfPermission(context,Manifest.permission.READ_CALENDAR)==PackageManager.PERMISSION_GRANTED;}
    boolean writable(){return ContextCompat.checkSelfPermission(context,Manifest.permission.WRITE_CALENDAR)==PackageManager.PERMISSION_GRANTED;}
    private synchronized String device(){String id=prefs.getString("device",null);if(id==null){id=UUID.randomUUID().toString();prefs.edit().putString("device",id).commit();}return id;}
    JSONArray selected()throws JSONException{return new JSONArray(prefs.getString("sources","[]"));}
    private String identity(String id){
        try(Cursor c=resolver.query(Calendars.CONTENT_URI,new String[]{Calendars.ACCOUNT_NAME,Calendars.ACCOUNT_TYPE,Calendars.NAME,Calendars.OWNER_ACCOUNT},Calendars._ID+"=?",new String[]{id},null)){
            if(c==null||!c.moveToFirst())return "";JSONArray values=new JSONArray();for(int i=0;i<4;i++)values.put(c.isNull(i)?JSONObject.NULL:c.getString(i));return values.toString();
        }
    }
    String mode(String id)throws JSONException{JSONArray list=selected();for(int i=0;i<list.length();i++){JSONObject row=list.getJSONObject(i);if(id.equals(row.getString("id"))&&row.optString("identity").equals(identity(id)))return row.getString("mode");}return "off";}
    JSONObject sources()throws Exception{
        JSONArray list=new JSONArray();
        if(readable())try(Cursor c=resolver.query(Calendars.CONTENT_URI,new String[]{Calendars._ID,Calendars.CALENDAR_DISPLAY_NAME,Calendars.ACCOUNT_NAME,Calendars.ACCOUNT_TYPE,Calendars.CALENDAR_COLOR,Calendars.CALENDAR_ACCESS_LEVEL},null,null,Calendars._ID+" ASC")){
            if(c==null)throw new IllegalStateException("휴대폰 캘린더 목록을 읽지 못했어요.");
            while(c.moveToNext())list.put(new JSONObject().put("id",c.getString(0)).put("name",c.getString(1)).put("account",c.getString(2)).put("type",c.getString(3)).put("color",String.format(Locale.ROOT,"#%06x",c.getInt(4)&0xffffff)).put("writable",c.getInt(5)>=Calendars.CAL_ACCESS_CONTRIBUTOR));
        }
        JSONArray active=new JSONArray();if(readable())for(int i=0;i<list.length();i++){String id=list.getJSONObject(i).getString("id"),mode=mode(id);if(!mode.equals("off"))active.put(new JSONObject().put("id",id).put("mode",mode));}
        return new JSONObject().put("granted",readable()).put("writeGranted",writable()).put("device",device()).put("sources",list).put("selected",readable()?active:selected()).put("lastSync",prefs.getLong("lastSync",0));
    }
    void configure(JSONArray selection)throws Exception{
        if(!readable())throw new SecurityException("캘린더 읽기 권한을 허용해 주세요.");
        JSONArray available=sources().getJSONArray("sources"),clean=new JSONArray();Set<String> seen=new HashSet<>();
        for(int i=0;i<selection.length();i++){
            JSONObject row=selection.getJSONObject(i);String id=row.getString("id"),mode=row.getString("mode");
            if(!Set.of("read","two-way").contains(mode)||!seen.add(id))throw new IllegalArgumentException();
            JSONObject source=null;for(int j=0;j<available.length();j++)if(id.equals(available.getJSONObject(j).getString("id")))source=available.getJSONObject(j);
            if(source==null)throw new SecurityException("이 기기에서 캘린더를 찾지 못했어요. 목록을 새로 확인해 주세요.");
            if(mode.equals("two-way")&&(!writable()||!source.getBoolean("writable")))throw new SecurityException("이 캘린더에는 쓰기 권한이 없어요. 가져오기를 선택해 주세요.");
            clean.put(new JSONObject().put("id",id).put("mode",mode).put("identity",identity(id)));
        }
        prefs.edit().putString("sources",clean.toString()).commit();BackgroundSyncWorker.soon(context);
    }
    private JSONObject row(Cursor c)throws Exception{
        JSONObject row=new JSONObject();for(int i=0;i<FIELDS.length;i++){
            Object value=c.isNull(i)?JSONObject.NULL:c.getType(i)==Cursor.FIELD_TYPE_INTEGER?c.getLong(i):c.getString(i);row.put(FIELDS[i],value);
        }return row;
    }
    private JSONArray rows(String calendar)throws Exception{
        JSONArray result=new JSONArray();
        try(Cursor c=resolver.query(Events.CONTENT_URI,FIELDS,Events.CALENDAR_ID+"=? AND "+Events.DELETED+"=0",new String[]{calendar},Events._ID+" ASC")){
            if(c==null)throw new IllegalStateException("일정 목록을 읽지 못했어요.");while(c.moveToNext())result.put(row(c));
        }return result;
    }
    static String fingerprint(JSONArray rows)throws Exception{
        JSONArray canonical=new JSONArray();for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);JSONArray values=new JSONArray();for(String key:FIELDS)values.put(row.opt(key));canonical.put(values);}
        byte[] bytes=MessageDigest.getInstance("SHA-256").digest(canonical.toString().getBytes(StandardCharsets.UTF_8));StringBuilder result=new StringBuilder();for(byte b:bytes)result.append(String.format(Locale.ROOT,"%02x",b&255));return result.toString();
    }
    JSONObject scan()throws Exception{
        if(!readable())throw new SecurityException("캘린더 읽기 권한이 필요해요.");
        JSONObject sourceState=sources(),zones=new JSONObject();JSONArray records=new JSONArray(),families=new JSONArray(),available=sourceState.getJSONArray("sources"),completed=new JSONArray();
        for(int i=0;i<available.length();i++){
            String id=available.getJSONObject(i).getString("id");if(mode(id).equals("off"))continue;
            JSONArray events=rows(id);completed.put(id);
            for(int j=0;j<events.length();j++){
                JSONObject event=events.getJSONObject(j);records.put(event);
                String zone=event.isNull(Events.EVENT_TIMEZONE)?"UTC":event.optString(Events.EVENT_TIMEZONE,"UTC");
                if(!zones.has(zone))zones.put(zone,timezone(zone));
                if(event.isNull(Events.ORIGINAL_ID)){
                    JSONArray group=family(events,event.getString(Events._ID));
                    families.put(new JSONObject().put("id",event.getString(Events._ID)).put("source",id).put("version",fingerprint(group)).put("records",group));
                }
            }
        }
        return new JSONObject().put("records",records).put("families",families).put("zones",zones).put("scanned",completed);
    }
    private void assertSelectedWritable(String calendar)throws Exception{
        if(!readable()||!writable()||!mode(calendar).equals("two-way"))throw new SecurityException("선택한 양방향 캘린더에만 변경할 수 있어요.");
        try(Cursor c=resolver.query(Calendars.CONTENT_URI,new String[]{Calendars.CALENDAR_ACCESS_LEVEL},Calendars._ID+"=?",new String[]{calendar},null)){
            if(c==null||!c.moveToFirst()||c.getInt(0)<Calendars.CAL_ACCESS_CONTRIBUTOR)throw new SecurityException("캘린더 쓰기 권한이 변경됐어요.");
        }
    }
    private JSONArray family(JSONArray all,String id)throws Exception{
        JSONArray result=new JSONArray();for(int i=0;i<all.length();i++){JSONObject row=all.getJSONObject(i);if(id.equals(row.optString(Events._ID))||id.equals(row.optString(Events.ORIGINAL_ID)))result.put(row);}return result;
    }
    private ContentValues values(JSONObject event,String calendar)throws Exception{
        ContentValues values=new ContentValues();values.put(Events.CALENDAR_ID,Long.parseLong(calendar));
        String[] text={Events.TITLE,Events.DESCRIPTION,Events.EVENT_LOCATION,Events.EVENT_TIMEZONE,Events.EVENT_END_TIMEZONE,Events.DURATION,Events.RRULE,Events.RDATE,Events.EXRULE,Events.EXDATE};
        String[] numbers={Events.DTSTART,Events.DTEND,Events.ALL_DAY,Events.STATUS,Events.AVAILABILITY,Events.ACCESS_LEVEL,Events.EVENT_COLOR,Events.ORIGINAL_INSTANCE_TIME,Events.ORIGINAL_ALL_DAY};
        for(String key:text)if(event.has(key)){if(event.isNull(key))values.putNull(key);else values.put(key,event.getString(key));}
        for(String key:numbers)if(event.has(key)){if(event.isNull(key)){if(key.equals(Events.DTEND)||key.equals(Events.EVENT_COLOR))values.putNull(key);}else values.put(key,event.getLong(key));}
        return values;
    }
    JSONObject write(JSONObject input)throws Exception{
        String calendar=input.getString("source"),id=input.optString("id","");assertSelectedWritable(calendar);
        JSONArray all=rows(calendar),before=id.isEmpty()?new JSONArray():family(all,id);
        String link="link:"+input.getString("key");
        // Record an insert identity before returning. A lost JS response cannot duplicate it.
        String marker="calendar://device-sync/"+Uri.encode(input.getString("key"));
        if(id.isEmpty()){
            String previous=prefs.getString(link,"");
            if(previous.isEmpty())try(Cursor c=resolver.query(Events.CONTENT_URI,new String[]{Events._ID},Events.CALENDAR_ID+"=? AND "+Events.CUSTOM_APP_URI+"=? AND "+Events.DELETED+"=0",new String[]{calendar,marker},null)){if(c!=null&&c.moveToFirst())previous=c.getString(0);}
            if(!previous.isEmpty()){JSONArray recovered=family(all,previous);if(recovered.length()>0)return new JSONObject().put("id",previous).put("version",fingerprint(recovered)).put("records",recovered).put("conflict",false);}
        }else if(before.length()==0||!fingerprint(before).equals(input.getString("version")))return new JSONObject().put("conflict",true).put("id",id);
        JSONArray incoming=input.getJSONArray("events");if(incoming.length()==0||incoming.length()>1000)throw new IllegalArgumentException();
        ArrayList<ContentProviderOperation> operations=new ArrayList<>();
        if(!id.isEmpty())operations.add(ContentProviderOperation.newAssertQuery(Events.CONTENT_URI).withSelection(Events.CALENDAR_ID+"=? AND "+Events.DELETED+"=0 AND ("+Events._ID+"=? OR "+Events.ORIGINAL_ID+"=?)",new String[]{calendar,id,id}).withExpectedCount(before.length()).build());
        for(int i=0;i<before.length();i++){
            JSONObject original=before.getJSONObject(i);ContentValues expected=new ContentValues();
            for(String field:FIELDS){Object value=original.opt(field);if(value==JSONObject.NULL||value==null)expected.putNull(field);else expected.put(field,String.valueOf(value));}
            operations.add(ContentProviderOperation.newAssertQuery(ContentUris.withAppendedId(Events.CONTENT_URI,original.getLong(Events._ID))).withValues(expected).withExpectedCount(1).build());
        }
        int masterOperation=operations.size();Set<String> retained=new HashSet<>();
        for(int i=0;i<incoming.length();i++){
            JSONObject event=incoming.getJSONObject(i);String originalTime=event.isNull(Events.ORIGINAL_INSTANCE_TIME)?"":event.optString(Events.ORIGINAL_INSTANCE_TIME,"");
            JSONObject existing=null;
            for(int j=0;j<before.length();j++){
                JSONObject old=before.getJSONObject(j);String oldTime=old.isNull(Events.ORIGINAL_INSTANCE_TIME)?"":old.optString(Events.ORIGINAL_INSTANCE_TIME,"");
                if(originalTime.equals(oldTime)){existing=old;break;}
            }
            ContentValues values=values(event,calendar);
            if(existing!=null){String oldId=existing.getString(Events._ID);retained.add(oldId);operations.add(ContentProviderOperation.newUpdate(ContentUris.withAppendedId(Events.CONTENT_URI,Long.parseLong(oldId))).withValues(values).build());}
            else{
                ContentProviderOperation.Builder insert=ContentProviderOperation.newInsert(Events.CONTENT_URI).withValues(values);
                if(originalTime.isEmpty())insert.withValue(Events.CUSTOM_APP_URI,marker).withValue(Events.CUSTOM_APP_PACKAGE,context.getPackageName());
                if(!originalTime.isEmpty()){if(id.isEmpty())insert.withValueBackReference(Events.ORIGINAL_ID,masterOperation);else insert.withValue(Events.ORIGINAL_ID,Long.parseLong(id));}
                operations.add(insert.build());
            }
        }
        // Removing exceptions changes recurrence semantics; preserve them rather than silently dropping them.
        for(int i=0;i<before.length();i++)if(!retained.contains(before.getJSONObject(i).getString(Events._ID)))throw new IllegalArgumentException("반복 예외를 삭제하는 변경은 원래 캘린더 앱에서 해 주세요.");
        ContentProviderResult[] results;
        try{results=resolver.applyBatch(CalendarContract.AUTHORITY,operations);}catch(OperationApplicationException changed){return new JSONObject().put("conflict",true).put("id",id);}
        if(id.isEmpty()){id=Long.toString(ContentUris.parseId(results[masterOperation].uri));prefs.edit().putString(link,id).commit();}
        JSONArray after=family(rows(calendar),id);
        return new JSONObject().put("id",id).put("version",fingerprint(after)).put("records",after).put("conflict",false);
    }
    void completed(){prefs.edit().putLong("lastSync",System.currentTimeMillis()).apply();}
    JSONObject remove(JSONObject input)throws Exception{
        String calendar=input.getString("source"),id=input.getString("id");assertSelectedWritable(calendar);
        JSONArray before=family(rows(calendar),id);
        if(before.length()==0)return new JSONObject().put("conflict",false);
        if(!fingerprint(before).equals(input.getString("version")))return new JSONObject().put("conflict",true);
        ArrayList<ContentProviderOperation> operations=new ArrayList<>();
        operations.add(ContentProviderOperation.newAssertQuery(Events.CONTENT_URI).withSelection(Events.CALENDAR_ID+"=? AND "+Events.DELETED+"=0 AND ("+Events._ID+"=? OR "+Events.ORIGINAL_ID+"=?)",new String[]{calendar,id,id}).withExpectedCount(before.length()).build());
        for(int i=0;i<before.length();i++){
            JSONObject original=before.getJSONObject(i);ContentValues expected=new ContentValues();
            for(String field:FIELDS){Object value=original.opt(field);if(value==JSONObject.NULL||value==null)expected.putNull(field);else expected.put(field,String.valueOf(value));}
            operations.add(ContentProviderOperation.newAssertQuery(ContentUris.withAppendedId(Events.CONTENT_URI,original.getLong(Events._ID))).withValues(expected).withExpectedCount(1).build());
        }
        operations.add(ContentProviderOperation.newDelete(Events.CONTENT_URI).withSelection(Events.CALENDAR_ID+"=? AND ("+Events._ID+"=? OR "+Events.ORIGINAL_ID+"=?)",new String[]{calendar,id,id}).build());
        try{resolver.applyBatch(CalendarContract.AUTHORITY,operations);}catch(OperationApplicationException changed){return new JSONObject().put("conflict",true);}
        return new JSONObject().put("conflict",false);
    }
    static String timezone(String id){
        ZoneId zone;try{zone=ZoneId.of(id);}catch(Exception invalid){throw new IllegalArgumentException("지원하지 않는 시간대: "+id);}
        DateTimeFormatter format=DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss",Locale.ROOT);ZoneRules rules=zone.getRules();
        Map<String,List<String>> dates=new LinkedHashMap<>();Instant cursor=Instant.parse("1900-01-01T00:00:00Z"),until=Instant.parse("2101-01-01T00:00:00Z");
        for(ZoneOffsetTransition transition=rules.nextTransition(cursor);transition!=null&&transition.getInstant().isBefore(until);transition=rules.nextTransition(cursor)){
            String from=offset(transition.getOffsetBefore()),to=offset(transition.getOffsetAfter());String key=(rules.isDaylightSavings(transition.getInstant())?"DAYLIGHT":"STANDARD")+"|"+from+"|"+to;
            dates.computeIfAbsent(key,k->new ArrayList<>()).add(format.format(transition.getDateTimeBefore()));cursor=transition.getInstant().plusSeconds(1);
        }
        StringBuilder result=new StringBuilder("BEGIN:VTIMEZONE\r\nTZID:").append(id).append("\r\n");
        String initial=offset(rules.getOffset(Instant.parse("1900-01-01T00:00:00Z")));
        result.append("BEGIN:STANDARD\r\nDTSTART:19000101T000000\r\nTZOFFSETFROM:").append(initial).append("\r\nTZOFFSETTO:").append(initial).append("\r\nEND:STANDARD\r\n");
        dates.forEach((key,list)->{String[] parts=key.split("\\|");result.append("BEGIN:").append(parts[0]).append("\r\nDTSTART:").append(list.get(0)).append("\r\nTZOFFSETFROM:").append(parts[1]).append("\r\nTZOFFSETTO:").append(parts[2]).append("\r\n");if(list.size()>1)result.append("RDATE:").append(String.join(",",list.subList(1,list.size()))).append("\r\n");result.append("END:").append(parts[0]).append("\r\n");});
        return result.append("END:VTIMEZONE\r\n").toString();
    }
    private static String offset(ZoneOffset offset){int seconds=offset.getTotalSeconds(),absolute=Math.abs(seconds);return String.format(Locale.ROOT,"%s%02d%02d%s",seconds<0?"-":"+",absolute/3600,absolute/60%60,absolute%60==0?"":String.format(Locale.ROOT,"%02d",absolute%60));}
}
