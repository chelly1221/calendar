package kr.threechan.calendar;

import static org.junit.Assert.*;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;
import kr.threechan.calendar.widget.*;

/** Run only on a disposable emulator with networking disabled and cleared debug app data. */
@RunWith(AndroidJUnit4.class)
public class OfflineStartupTest {
    private String js(ActivityScenario<MainActivity> app,String script)throws Exception{
        String code=script.replace("20260911",java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE))
            .replace("20260912",java.time.LocalDate.now().plusDays(1).format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE));
        AtomicReference<String> value=new AtomicReference<>("");
        CountDownLatch done=new CountDownLatch(1);
        app.onActivity(a->a.getBridge().getWebView().evaluateJavascript(code,result->{value.set(result);done.countDown();}));
        assertTrue(done.await(5,TimeUnit.SECONDS));return value.get();
    }
    private void await(ActivityScenario<MainActivity> app,String expression)throws Exception{
        for(int i=0;i<80;i++){if("true".equals(js(app,expression)))return;SystemClock.sleep(100);}
        fail("Offline app startup did not reach: "+expression);
    }
    private void offline(ActivityScenario<MainActivity> app){
        app.onActivity(a->{
            a.getBridge().getWebView().getSettings().setBlockNetworkLoads(true);
            a.getBridge().getWebView().setNetworkAvailable(false);
        });
    }
    @Test public void localContentSurvivesRelaunchWithoutConnectionGate()throws Exception{
        try(ActivityScenario<MainActivity> app=ActivityScenario.launch(MainActivity.class)){
            offline(app);
            await(app,"document.body.innerText.length>10 && !document.body.innerText.includes('여는 중')");
            assertEquals("Disable Wi-Fi/data on the test emulator first","false",js(app,"navigator.onLine"));
            js(app,"(()=>{const open=indexedDB.open('calendar-data');open.onerror=()=>window.__localSeed='error';open.onsuccess=()=>{const db=open.result;const tx=db.transaction([\"events\",\"calendars\",\"meta\"],'readwrite');tx.objectStore('calendars').put({id:'default',name:'내 달력',color:'#b59ae8'});tx.objectStore('meta').put({key:'profile',value:JSON.stringify({login:'offline-fixture',name:'기기 저장 검증'})});tx.objectStore('events').put({key:'default/local-qa.ics',id:'local-qa.ics',calendarId:'default',ical:'BEGIN:VCALENDAR\\r\\nVERSION:2.0\\r\\nBEGIN:VEVENT\\r\\nUID:local-qa\\r\\nDTSTAMP:20260911T000000Z\\r\\nDTSTART;VALUE=DATE:20260911\\r\\nDTEND;VALUE=DATE:20260912\\r\\nSUMMARY:로컬 일정 검증\\r\\nEND:VEVENT\\r\\nEND:VCALENDAR',etag:null,dirty:true,deleted:false,version:1,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();window.__localSeed='ready';};tx.onerror=()=>window.__localSeed='error';};})()");
            await(app,"window.__localSeed==='ready'");
        }
        Intent launch=new Intent(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext(),MainActivity.class)
            .putExtra("widget_date",java.time.LocalDate.now().toString()).putExtra("widget_action","event")
            .putExtra("widget_key","default/local-qa.ics").putExtra("widget_recurrence_id",java.time.LocalDate.now().toString());
        try(ActivityScenario<MainActivity> app=ActivityScenario.launch(launch)){
            offline(app);
            await(app,"document.body.innerText.includes('로컬 일정 검증') && !document.querySelector('.access-page, main.gate')");
            assertEquals("false",js(app,"navigator.onLine"));
            assertEquals("false",js(app,"Boolean(document.querySelector('.access-page, main.gate'))"));
            await(app,"Boolean(document.querySelector('dialog[open] input')?.value==='로컬 일정 검증')");
            js(app,"document.querySelector('dialog[open] button[aria-label=닫기]').click()");
            await(app,"!document.querySelector('dialog[open]')");
            // Wait for the real JS snapshot, then click an actual RemoteViews event row on a warm app.
            for(int i=0;i<60&&!WidgetStore.read(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext()).toString().contains("로컬 일정 검증");i++)SystemClock.sleep(100);
            app.onActivity(a->{
                View widget=WidgetRenderer.render(a,42,new WidgetConfig(new org.json.JSONObject()),WidgetStore.read(a),400,800,java.time.YearMonth.now())
                    .apply(a.getApplicationContext(),new FrameLayout(a));
                View row=eventRow(widget);
                assertNotNull("Snapshot event row missing",row);assertTrue(row.isClickable());assertTrue(row.performClick());
            });
            await(app,"Boolean(document.querySelector('dialog[open] input')?.value==='로컬 일정 검증')");
        }
    }
    private View eventRow(View view){
        if(view instanceof TextView && "로컬 일정 검증".contentEquals(((TextView)view).getText()))return (View)view.getParent();
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){
            View found=eventRow(((ViewGroup)view).getChildAt(i));if(found!=null)return found;
        }
        return null;
    }
}
