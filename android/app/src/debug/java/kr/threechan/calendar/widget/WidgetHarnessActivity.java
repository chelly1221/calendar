package kr.threechan.calendar.widget;

import android.app.Activity;
import android.appwidget.*;
import android.content.*;
import android.graphics.Color;
import android.os.Bundle;
import android.util.SizeF;
import android.view.*;
import android.widget.*;
import java.time.*;
import java.util.ArrayList;
import org.json.*;

/** Debug-only launcher host with clearly labeled synthetic content. Never in the release APK. */
public class WidgetHarnessActivity extends Activity {
    public static WidgetHarnessActivity active;
    public AppWidgetHost host;
    public int widgetId;
    public AppWidgetHostView widget;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);active=this;
        try{
            if(getIntent().getBooleanExtra("fixture",true))WidgetStore.write(this,fixture());
            host=new AppWidgetHost(this,8075);
            widgetId=WidgetConfig.prefs(this).getInt("qaId",-1);
            if(!CalendarWidgetProvider.owns(this,widgetId)){
                widgetId=host.allocateAppWidgetId();
                if(!AppWidgetManager.getInstance(this).bindAppWidgetIdIfAllowed(widgetId,new ComponentName(this,CalendarWidgetProvider.class)))throw new IllegalStateException("Grant debug BIND_APPWIDGET first");
                WidgetConfig.prefs(this).edit().putInt("qaId",widgetId).commit();
            }
            WidgetConfig cfg=new WidgetConfig(new JSONObject());
            cfg.set("theme",getIntent().getStringExtra("theme")==null?"dark":getIntent().getStringExtra("theme"));
            cfg.set("showTime",getIntent().getBooleanExtra("showTime",false));
            cfg.set("textSize",getIntent().getIntExtra("textSize",11));
            cfg.save(this,widgetId);
            LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(0xff393641);root.setPadding(dp(8),0,dp(8),0);
            androidx.core.view.WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
            androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(root,(v,insets)->{
                androidx.core.graphics.Insets bars=insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()|androidx.core.view.WindowInsetsCompat.Type.displayCutout());
                v.setPadding(bars.left+dp(8),bars.top,bars.right+dp(8),bars.bottom);return insets;
            });
            TextView title=new TextView(this);title.setText("달력 위젯 · 검증용 예시 일정");title.setTextSize(13);title.setTextColor(Color.WHITE);title.setGravity(Gravity.CENTER);root.addView(title,new LinearLayout.LayoutParams(-1,dp(40)));
            widget=host.createView(this,widgetId,AppWidgetManager.getInstance(this).getAppWidgetInfo(widgetId));
            int h=getIntent().getIntExtra("height",0);
            root.addView(widget,h==0?new LinearLayout.LayoutParams(-1,0,1):new LinearLayout.LayoutParams(-1,dp(h)));
            setContentView(root);
            widget.post(()->{
                float density=getResources().getDisplayMetrics().density;
                int width=Math.round(widget.getWidth()/density),height=Math.round(widget.getHeight()/density);
                ArrayList<SizeF> sizes=new ArrayList<>();sizes.add(new SizeF(width,height));
                widget.updateAppWidgetSize(new Bundle(),sizes);CalendarWidgetProvider.update(this,widgetId);
            });
        }catch(Exception error){TextView view=new TextView(this);view.setText(error.toString());setContentView(view);throw new RuntimeException(error);}
    }
    private int dp(int value){return WidgetRenderer.dp(this,value);}
    @Override public void onStart(){super.onStart();if(host!=null)host.startListening();}
    @Override public void onStop(){if(host!=null)host.stopListening();super.onStop();}
    @Override public void onDestroy(){if(host!=null)host.stopListening();if(active==this)active=null;super.onDestroy();}
    public static JSONObject fixture()throws Exception{
        LocalDate today=LocalDate.now();YearMonth month=YearMonth.from(today);
        JSONObject result=new JSONObject().put("version",1).put("generatedAt",System.currentTimeMillis()).put("lastSync",System.currentTimeMillis()-120000)
            .put("rangeStart",month.minusMonths(24).atDay(1).toString()).put("rangeEnd",month.plusMonths(25).atDay(1).toString()).put("pending",0).put("failures",0);
        JSONArray calendars=new JSONArray().put(new JSONObject().put("id","work").put("name","업무").put("color","#b59ae8"))
            .put(new JSONObject().put("id","life").put("name","개인").put("color","#f3b789"))
            .put(new JSONObject().put("id","family").put("name","가족").put("color","#9ed6c4"));result.put("calendars",calendars);
        JSONArray events=new JSONArray();String[] titles={"프로젝트 회의와 다음 단계 정리","가족 저녁 약속","운동","자료 검토","오후 산책","친구와 점심","주간 회고","책 읽기"};
        for(int d=1;d<=month.lengthOfMonth();d++){
            if(d%7==0)continue;
            int count=d==today.getDayOfMonth()?10:d%6==0?5:d%3==0?3:1;
            for(int i=0;i<count;i++){
                LocalDate day=month.atDay(d);boolean allDay=i%3==0;
                ZonedDateTime start=day.atTime(9+i,0).atZone(ZoneId.systemDefault());
                String cal=i%3==0?"work":i%3==1?"life":"family";
                events.put(new JSONObject().put("key",cal+"/"+d+"-"+i).put("calendarId",cal).put("title",titles[(d+i)%titles.length])
                    .put("allDay",allDay).put("floating",false).put("start",start.toInstant().toEpochMilli()).put("end",start.plusHours(1).toInstant().toEpochMilli())
                    .put("startDay",day.toString()).put("endDay",day.plusDays(1).toString()));
            }
        }
        return result.put("events",events);
    }
}
