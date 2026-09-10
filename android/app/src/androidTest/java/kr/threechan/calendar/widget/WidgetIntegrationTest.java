package kr.threechan.calendar.widget;

import static org.junit.Assert.*;
import android.app.Activity;
import android.app.Instrumentation;
import android.appwidget.*;
import android.content.*;
import android.graphics.Bitmap;
import android.os.*;
import android.view.*;
import android.widget.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.time.*;
import java.util.*;
import kr.threechan.calendar.R;
import kr.threechan.calendar.MainActivity;

@RunWith(AndroidJUnit4.class)
public class WidgetIntegrationTest {
    final Instrumentation instrument=InstrumentationRegistry.getInstrumentation();
    final Context context=instrument.getTargetContext();
    @Test public void eventColorsAndDistinctClickTargets()throws Exception{
        JSONObject snapshot=WidgetHarnessActivity.fixture();
        JSONObject raw=snapshot.getJSONArray("events").getJSONObject(0);
        raw.put("color","#ff6347").put("recurrenceId","2026-09-11");
        WidgetConfig cfg=new WidgetConfig(new JSONObject());
        WidgetCalendar.Entry entry=WidgetCalendar.entries(snapshot,cfg,YearMonth.now().atDay(1),31,ZoneId.systemDefault()).get(YearMonth.now().atDay(1)).get(0);
        assertEquals("#ff6347",entry.color);assertEquals(raw.getString("key"),entry.key);
        android.app.PendingIntent first=WidgetRenderer.openEvent(context,7,LocalDate.now(),entry);
        entry.key="another-calendar/same #한글.ics";
        assertNotEquals(first,WidgetRenderer.openEvent(context,7,LocalDate.now(),entry));
        entry.key=raw.getString("key");entry.recurrenceId="2026-09-12";
        assertNotEquals(first,WidgetRenderer.openEvent(context,7,LocalDate.now(),entry));
        for(String theme:new String[]{"dark","light"})for(String style:new String[]{"tint","solid","plain"}){
            cfg.set("theme",theme);cfg.set("eventStyle",style);
            instrument.runOnMainSync(()->{
                View view=WidgetRenderer.render(context,7,cfg,snapshot,400,800,YearMonth.now()).apply(context,new FrameLayout(context));
                View marker=find(view,R.id.widget_event_color);
                assertEquals(View.VISIBLE,marker.getVisibility());
                assertEquals(0xffff6347,((android.graphics.drawable.ColorDrawable)marker.getBackground()).getColor());
                View row=find(view,R.id.widget_event);assertTrue(row.isClickable());
                assertTrue(row.getContentDescription().toString().contains("일정 열기"));
            });
        }
    }
    @Test public void bundledAppPublishesThroughCapacitor()throws Exception{
        long before=WidgetStore.read(context).optLong("generatedAt");
        MainActivity app=(MainActivity)instrument.startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        for(int i=0;i<150&&WidgetStore.read(context).optLong("generatedAt")<=before;i++)SystemClock.sleep(100);
        assertNotNull(app.getBridge().getPlugin("CalendarWidgets"));
        JSONObject snapshot=WidgetStore.read(context);
        assertTrue("Bundled JavaScript did not publish to the native plugin",snapshot.optLong("generatedAt")>before);
        assertEquals(1,snapshot.getInt("version"));
        assertTrue(snapshot.getJSONArray("calendars").length()>0);
        instrument.runOnMainSync(app::finish);
    }
    @Test public void datesFiltersAndDurableSnapshot()throws Exception{
        assertEquals(4,WidgetCalendar.weekCount(YearMonth.of(2026,2),0,false));
        assertEquals(6,WidgetCalendar.weekCount(YearMonth.of(2026,8),0,false));
        assertEquals(LocalDate.of(2026,8,31),WidgetCalendar.firstDay(YearMonth.of(2026,9),1));
        assertTrue(WidgetCalendar.capacity(700,5,17,18,3,true,0)>WidgetCalendar.capacity(230,5,17,18,3,true,0));
        assertTrue(WidgetCalendar.capacity(1400,5,17,18,3,true,0)>=10);
        WidgetConfig cfg=new WidgetConfig(new JSONObject());cfg.set("allCalendars",false);cfg.set("calendarIds",new JSONArray().put("work"));
        JSONObject snapshot=WidgetHarnessActivity.fixture();
        Map<LocalDate,List<WidgetCalendar.Entry>> days=WidgetCalendar.entries(snapshot,cfg,YearMonth.now().atDay(1),31,ZoneId.of("Asia/Seoul"));
        assertFalse(days.isEmpty());for(List<WidgetCalendar.Entry> entries:days.values())for(WidgetCalendar.Entry e:entries)assertEquals("#b59ae8",e.color);
        cfg.set("allDay",false);assertTrue(WidgetCalendar.entries(snapshot,cfg,YearMonth.now().atDay(1),31,ZoneId.systemDefault()).isEmpty());
        WidgetStore.write(context,snapshot);assertEquals(snapshot.getJSONArray("events").length(),WidgetStore.read(context).getJSONArray("events").length());
        JSONObject old=new JSONObject(snapshot.toString());old.put("generatedAt",1).put("events",new JSONArray());WidgetStore.write(context,old);
        assertTrue(WidgetStore.read(context).getJSONArray("events").length()>0);
    }
    @Test public void actualHostNavigationResizeAndConfiguration()throws Exception{
        WidgetHarnessActivity activity=(WidgetHarnessActivity)instrument.startActivitySync(new Intent(context,WidgetHarnessActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        awaitView(activity,R.id.widget_month);
        int id=activity.widgetId;
        instrument.runOnMainSync(()->{
            assertTrue(CalendarWidgetProvider.owns(context,id));
            assertFalse(titles(activity.widget).isEmpty());
            assertTitlesFit(activity.widget);
            new CalendarWidgetProvider().onReceive(context,new Intent(CalendarWidgetProvider.ACTION_PREFIX+"NEXT").putExtra("appWidgetId",id));
        });
        assertEquals(YearMonth.now().plusMonths(1),CalendarWidgetProvider.month(context,id,WidgetConfig.load(context,id)));
        instrument.runOnMainSync(()->new CalendarWidgetProvider().onReceive(context,new Intent(CalendarWidgetProvider.ACTION_PREFIX+"TODAY").putExtra("appWidgetId",id)));
        assertEquals(YearMonth.now(),CalendarWidgetProvider.month(context,id,WidgetConfig.load(context,id)));
        capture("phone-dark.png");
        WidgetConfigureActivity config=(WidgetConfigureActivity)instrument.startActivitySync(new Intent(context,WidgetConfigureActivity.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        awaitView(config,R.id.widget_month);assertFalse(titles(config.getWindow().getDecorView()).isEmpty());capture("settings-phone.png");
        String before=WidgetConfig.load(context,id).values.toString();
        instrument.runOnMainSync(()->control(config.getWindow().getDecorView(),"시작 시간 표시").performClick());
        instrument.runOnMainSync(config::finish);instrument.waitForIdleSync();assertEquals(before,WidgetConfig.load(context,id).values.toString());
        WidgetConfigureActivity saved=(WidgetConfigureActivity)instrument.startActivitySync(new Intent(context,WidgetConfigureActivity.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        awaitView(saved,R.id.widget_month);
        instrument.runOnMainSync(()->{control(saved.getWindow().getDecorView(),"시작 시간 표시").performClick();button(saved.getWindow().getDecorView(),"설정 저장").performClick();});
        instrument.waitForIdleSync();assertTrue(WidgetConfig.load(context,id).flag("showTime",false));
        assertFalse(WidgetConfig.load(context,-1).flag("showTime",false));
        instrument.runOnMainSync(activity::finish);
    }
    @Test public void captureVariant()throws Exception{
        Bundle args=InstrumentationRegistry.getArguments();String name=args.getString("captureName");if(name==null)return;
        Intent intent=new Intent(context,WidgetHarnessActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.putExtra("theme",args.getString("theme","dark"));intent.putExtra("height",Integer.parseInt(args.getString("height","0")));
        WidgetHarnessActivity a=(WidgetHarnessActivity)instrument.startActivitySync(intent);awaitView(a,R.id.widget_month);
        instrument.runOnMainSync(()->assertTitlesFit(a.widget));capture(name);
        if(args.getString("settingsCapture")!=null){
            WidgetConfigureActivity cfg=(WidgetConfigureActivity)instrument.startActivitySync(new Intent(context,WidgetConfigureActivity.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,a.widgetId).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            awaitView(cfg,R.id.widget_month);assertFalse(titles(cfg.getWindow().getDecorView()).isEmpty());capture(args.getString("settingsCapture"));instrument.runOnMainSync(cfg::finish);
        }
        instrument.runOnMainSync(a::finish);
    }
    private View control(View v,String description){
        if(description.contentEquals(v.getContentDescription()==null?"":v.getContentDescription()))return v;
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){View found=control(((ViewGroup)v).getChildAt(i),description);if(found!=null)return found;}
        return null;
    }
    private View button(View v,String title){
        if(v instanceof Button&&title.contentEquals(((Button)v).getText()))return v;
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){View found=button(((ViewGroup)v).getChildAt(i),title);if(found!=null)return found;}
        return null;
    }
    private void assertTitlesFit(View host){
        for(TextView v:titles(host)){
            assertEquals(1,v.getMaxLines());
            android.graphics.Rect bounds=new android.graphics.Rect(0,0,v.getWidth(),v.getHeight());
            ViewGroup day=(ViewGroup)v.getParent();
            while(day.getId()!=R.id.widget_day)day=(ViewGroup)day.getParent();
            day.offsetDescendantRectToMyCoords(v,bounds);
            assertTrue("Clipped event row: "+v.getText(),bounds.bottom<=day.getHeight());
        }
    }
    private void awaitView(Activity a,int id){
        for(int i=0;i<40;i++){
            final boolean[] found={false};instrument.runOnMainSync(()->found[0]=find(a.getWindow().getDecorView(),id)!=null);
            if(found[0]){SystemClock.sleep(350);return;}SystemClock.sleep(100);
        }
        throw new AssertionError("Widget RemoteViews did not inflate");
    }
    private View find(View v,int id){
        if(v.getId()==id)return v;
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){View found=find(((ViewGroup)v).getChildAt(i),id);if(found!=null)return found;}
        return null;
    }
    private List<TextView> titles(View view){
        List<TextView> result=new ArrayList<>();if(view.getId()==R.id.widget_event_title)result.add((TextView)view);
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++)result.addAll(titles(((ViewGroup)view).getChildAt(i)));
        return result;
    }
    private void capture(String name)throws Exception{
        instrument.waitForIdleSync();SystemClock.sleep(350);File dir=new File(context.getExternalFilesDir(null),"widget-qa");dir.mkdirs();
        Bitmap image=instrument.getUiAutomation().takeScreenshot();assertNotNull(image);
        try(FileOutputStream file=new FileOutputStream(new File(dir,name))){assertTrue(image.compress(Bitmap.CompressFormat.PNG,100,file));}image.recycle();
    }
}
