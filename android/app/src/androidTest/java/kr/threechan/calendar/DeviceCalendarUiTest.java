package kr.threechan.calendar;
import static org.junit.Assert.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.os.SystemClock;
import android.graphics.Bitmap;
import android.provider.CalendarContract;
import android.provider.CalendarContract.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.work.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import kr.threechan.calendar.widget.WidgetStore;

/** Run after OfflineStartupTest on the disposable emulator; never uses a real account. */
@RunWith(AndroidJUnit4.class)
public class DeviceCalendarUiTest {
 private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
 private String js(ActivityScenario<MainActivity> app,String code)throws Exception{AtomicReference<String> value=new AtomicReference<>("");CountDownLatch done=new CountDownLatch(1);app.onActivity(a->a.getBridge().getWebView().evaluateJavascript(code,result->{value.set(result);done.countDown();}));assertTrue(done.await(5,TimeUnit.SECONDS));return value.get();}
 private void waitFor(ActivityScenario<MainActivity> app,String code)throws Exception{for(int i=0;i<100;i++){if("true".equals(js(app,code)))return;SystemClock.sleep(100);}fail(code+" | "+js(app,"document.body.innerText"));}
 private void shell(String command)throws Exception{try(ParcelFileDescriptor fd=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);FileInputStream in=new FileInputStream(fd.getFileDescriptor())){in.readAllBytes();}}
 @Test public void selectionImportsProviderEventsAndHeadlessWorkRefreshesWidget()throws Exception{
  shell("pm grant "+context.getPackageName()+" android.permission.READ_CALENDAR");shell("pm grant "+context.getPackageName()+" android.permission.WRITE_CALENDAR");
  BackgroundSyncWorker.prefs(context).edit().putLong("remindAfter",System.currentTimeMillis()+86400000L).commit();
  Uri adapter=Calendars.CONTENT_URI.buildUpon().appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER,"true").appendQueryParameter(Calendars.ACCOUNT_NAME,"Calendar UI QA").appendQueryParameter(Calendars.ACCOUNT_TYPE,"LOCAL").build();
  ContentValues values=new ContentValues();values.put(Calendars.ACCOUNT_NAME,"Calendar UI QA");values.put(Calendars.ACCOUNT_TYPE,"LOCAL");values.put(Calendars.NAME,"ui-qa");values.put(Calendars.CALENDAR_DISPLAY_NAME,"기기 캘린더 검증");values.put(Calendars.CALENDAR_COLOR,0xff4263eb);values.put(Calendars.CALENDAR_ACCESS_LEVEL,Calendars.CAL_ACCESS_OWNER);values.put(Calendars.OWNER_ACCOUNT,"Calendar UI QA");values.put(Calendars.VISIBLE,1);values.put(Calendars.SYNC_EVENTS,1);
  long calendar=ContentUris.parseId(context.getContentResolver().insert(adapter,values));long start=java.time.LocalDate.now().atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli();
  values=new ContentValues();values.put(Events.CALENDAR_ID,calendar);values.put(Events.TITLE,"기기에서 가져온 일정");values.put(Events.DTSTART,start);values.put(Events.DTEND,start+86400000L);values.put(Events.ALL_DAY,1);values.put(Events.EVENT_TIMEZONE,"UTC");values.put(Events.EVENT_COLOR,0xffeb4263);
  Uri event=context.getContentResolver().insert(Events.CONTENT_URI,values);OneTimeWorkRequest work=null;
  try{
   try(ActivityScenario<MainActivity> app=ActivityScenario.launch(MainActivity.class)){
    waitFor(app,"Boolean(document.querySelector('.calendar-list'))");
    js(app,"[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('설정'))?.click()");
    waitFor(app,"Boolean(document.querySelector('.device-calendar-settings select'))");
    js(app,"(()=>{const select=[...document.querySelectorAll('.device-calendar-settings select')].find(s=>s.getAttribute('aria-label').startsWith('기기 캘린더 검증'));select.value='two-way';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    js(app,"[...document.querySelectorAll('.device-calendar-settings button')].find(b=>b.textContent==='선택한 캘린더 연결').click()");
    waitFor(app,"document.querySelector('.device-calendar-settings').innerText.includes('선택한 캘린더를 연결했어요')");
    js(app,"document.querySelector('.device-calendar-settings').scrollIntoView({block:'start'})");
    CountDownLatch frame=new CountDownLatch(1);app.onActivity(a->a.getBridge().getWebView().postVisualStateCallback(1,new android.webkit.WebView.VisualStateCallback(){@Override public void onComplete(long id){frame.countDown();}}));assertTrue(frame.await(5,TimeUnit.SECONDS));SystemClock.sleep(500);
    Bitmap shot=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();try(FileOutputStream out=new FileOutputStream(new File(context.getExternalFilesDir(null),"device-calendars.png"))){shot.compress(Bitmap.CompressFormat.PNG,100,out);}shot.recycle();
    for(int i=0;i<50&&!WidgetStore.read(context).toString().contains("기기에서 가져온 일정");i++)SystemClock.sleep(100);
    assertTrue(WidgetStore.read(context).toString().contains("기기에서 가져온 일정"));assertTrue(WidgetStore.read(context).toString().contains("#eb4263"));
   }
   values=new ContentValues();values.put(Events.TITLE,"앱 닫은 뒤 바뀐 일정");context.getContentResolver().update(event,values,null,null);
   BackgroundSyncWorker.foreground(false);BackgroundSyncWorker.prefs(context).edit().putBoolean("enabled",true).commit();
   work=new OneTimeWorkRequest.Builder(BackgroundSyncWorker.class).build();WorkManager.getInstance(context).enqueue(work).getResult().get();
   for(int i=0;i<120&&!WidgetStore.read(context).toString().contains("앱 닫은 뒤 바뀐 일정");i++)SystemClock.sleep(100);
   assertTrue("Headless worker must publish device changes before waiting for the private server",WidgetStore.read(context).toString().contains("앱 닫은 뒤 바뀐 일정"));
  }finally{
   if(work!=null)WorkManager.getInstance(context).cancelWorkById(work.getId()).getResult().get();BackgroundSyncWorker.configure(context,false);new DeviceCalendars(context).configure(new JSONArray());
   context.getContentResolver().delete(adapter.buildUpon().appendPath(Long.toString(calendar)).build(),null,null);
  }
 }
}
