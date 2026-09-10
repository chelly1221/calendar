package kr.threechan.calendar.widget;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.TextView;
import org.json.JSONObject;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import kr.threechan.calendar.MainActivity;
import kr.threechan.calendar.R;

public final class WidgetRenderer {
    private static float measuredLine(Context c,float size,boolean date) {
        // Measure Korean fallback fonts and Android's nonlinear font scaling, not an estimated multiplier.
        TextView probe=new TextView(c.getApplicationContext());
        probe.setText(date?"28":"일정 Ag");probe.setSingleLine(true);probe.setIncludeFontPadding(false);
        probe.setTextSize(TypedValue.COMPLEX_UNIT_SP,size);if(date)probe.setTypeface(null,1);
        probe.setPadding(0,dp(c,date?1:.5f),0,dp(c,date?1:.5f));
        probe.measure(View.MeasureSpec.UNSPECIFIED,View.MeasureSpec.UNSPECIFIED);
        return (probe.getMeasuredHeight()+(date?0:dp(c,1)))/c.getResources().getDisplayMetrics().density;
    }
    public static int previewHeight(Context c,WidgetConfig cfg,YearMonth month) {
        int weeks=WidgetCalendar.weekCount(month,cfg.number("weekStart",0,0,6),cfg.flag("fixedWeeks",false));
        float line=measuredLine(c,cfg.number("textSize",11,8,16),false);
        float date=measuredLine(c,cfg.number("dateSize",12,10,20),true);
        return Math.max(290,(int)Math.ceil(90+cfg.number("padding",3,0,10)*2+weeks*(line+date+4)));
    }
    public static int dp(Context c, float n) { return Math.round(n*c.getResources().getDisplayMetrics().density); }
    public static int color(String value, int fallback) { try { return Color.parseColor(value); } catch(Exception e) { return fallback; } }
    public static int blend(int a, int b, float ratio) {
        return Color.rgb(Math.round(Color.red(a)*ratio+Color.red(b)*(1-ratio)), Math.round(Color.green(a)*ratio+Color.green(b)*(1-ratio)), Math.round(Color.blue(a)*ratio+Color.blue(b)*(1-ratio)));
    }
    public static boolean light(int c) {
        double[] rgb={Color.red(c)/255d,Color.green(c)/255d,Color.blue(c)/255d};
        for(int i=0;i<3;i++) rgb[i]=rgb[i]<=.04045?rgb[i]/12.92:Math.pow((rgb[i]+.055)/1.055,2.4);
        return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.179;
    }
    public static int background(Context c, WidgetConfig cfg) {
        String theme=cfg.text("theme","dark");
        boolean night=(c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES;
        int base=(theme.equals("light")||(theme.equals("system")&&!night))?Color.rgb(250,250,250):Color.rgb(20,20,20);
        return cfg.flag("customBackground",false)?color(cfg.text("backgroundColor","#141414"),base):base;
    }
    public static PendingIntent openDay(Context c, int id, LocalDate day, String action) {
        Intent i=new Intent(c,MainActivity.class).setAction("calendar.widget.OPEN")
            .setData(Uri.parse("calendar-widget://open/"+id+"/"+day+"/"+action))
            .putExtra("widget_date",day.toString()).putExtra("widget_action",action)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    private static PendingIntent navigate(Context c,int id,String action) {
        Intent i=new Intent(c,CalendarWidgetProvider.class).setAction(CalendarWidgetProvider.ACTION_PREFIX+action)
            .setData(Uri.parse("calendar-widget://navigate/"+id+"/"+action)).putExtra("appWidgetId",id);
        return PendingIntent.getBroadcast(c,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    public static PendingIntent openEvent(Context c,int id,LocalDate day,WidgetCalendar.Entry event) {
        Intent intent=new Intent(c,MainActivity.class).setAction("calendar.widget.OPEN")
            .setData(new Uri.Builder().scheme("calendar-widget").authority("event").appendPath(Integer.toString(id))
                .appendPath(day.toString()).appendQueryParameter("key",event.key).appendQueryParameter("rid",event.recurrenceId).build())
            .putExtra("widget_date",day.toString()).putExtra("widget_action","event")
            .putExtra("widget_key",event.key).putExtra("widget_recurrence_id",event.recurrenceId)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    public static RemoteViews render(Context c,int id,WidgetConfig cfg,JSONObject data,float width,float height,YearMonth month) {
        RemoteViews root=new RemoteViews(c.getPackageName(),R.layout.calendar_widget);
        int bg=background(c,cfg),fg=light(bg)?Color.rgb(30,30,30):Color.rgb(241,241,241),muted=blend(fg,bg,.7f);
        int accent=color(cfg.text("accent","#b59ae8"),0xffb59ae8);
        if (light(bg) && light(accent)) accent=blend(accent,Color.BLACK,.55f);
        if (!light(bg) && !light(accent)) accent=blend(accent,Color.WHITE,.55f);
        int opacity=cfg.number("opacity",100,0,100)*255/100;
        String corners=cfg.text("corners","round");
        root.setImageViewResource(R.id.widget_background,corners.equals("square")?R.drawable.widget_square:corners.equals("soft")?R.drawable.widget_soft:R.drawable.widget_round);
        root.setInt(R.id.widget_background,"setColorFilter",bg);
        root.setInt(R.id.widget_background,"setImageAlpha",opacity);
        int padding=cfg.number("padding",3,0,10);
        root.setViewPadding(R.id.widget_content,dp(c,padding),dp(c,padding),dp(c,padding),dp(c,padding));
        root.setTextViewText(R.id.widget_month,width<280?month.getMonthValue()+"월":month.getYear()+". "+month.getMonthValue());
        root.setTextColor(R.id.widget_month,fg); root.setTextColor(R.id.widget_today,fg);
        root.setTextViewTextSize(R.id.widget_month,TypedValue.COMPLEX_UNIT_SP,width<280?14:17);
        for(int icon:new int[]{R.id.widget_previous,R.id.widget_next,R.id.widget_settings})root.setInt(icon,"setColorFilter",fg);
        if(id>=0){
            root.setOnClickPendingIntent(R.id.widget_previous,navigate(c,id,"PREVIOUS"));
            root.setOnClickPendingIntent(R.id.widget_next,navigate(c,id,"NEXT"));
            root.setOnClickPendingIntent(R.id.widget_today,navigate(c,id,"TODAY"));
            root.setOnClickPendingIntent(R.id.widget_month,openDay(c,id,month.atDay(1),"day"));
            Intent settings=new Intent(c,WidgetConfigureActivity.class).setData(Uri.parse("calendar-widget://settings/"+id))
                .putExtra(android.appwidget.AppWidgetManager.EXTRA_APPWIDGET_ID,id);
            root.setOnClickPendingIntent(R.id.widget_settings,PendingIntent.getActivity(c,id,settings,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
        }
        int start=cfg.number("weekStart",0,0,6),weeks=WidgetCalendar.weekCount(month,start,cfg.flag("fixedWeeks",false));
        LocalDate first=WidgetCalendar.firstDay(month,start),today=LocalDate.now();
        boolean inRange=false;
        try { inRange=!month.atDay(1).isBefore(LocalDate.parse(data.getString("rangeStart"))) && month.atEndOfMonth().isBefore(LocalDate.parse(data.getString("rangeEnd"))); } catch(Exception ignored) {}
        boolean footer=cfg.flag("footer",true)||!inRange||data.optInt("failures")>0;
        float text=cfg.number("textSize",11,8,16),dateSize=cfg.number("dateSize",12,10,20);
        int slots=WidgetCalendar.capacity(height,weeks,measuredLine(c,text,false),measuredLine(c,dateSize,true),padding,footer,cfg.number("maxLines",0,0,8));
        Map<LocalDate,List<WidgetCalendar.Entry>> events=inRange?WidgetCalendar.entries(data,cfg,first,weeks*7,ZoneId.systemDefault()):Collections.emptyMap();
        String[] names={"일","월","화","수","목","금","토"};
        int sunday=light(bg)?0xffb82839:0xffff9da8,saturday=light(bg)?0xff265fb4:0xffa3c4ff;
        root.removeAllViews(R.id.widget_weekdays);root.removeAllViews(R.id.widget_weeks);
        for(int col=0;col<7;col++){
            int day=(start+col)%7;
            RemoteViews label=new RemoteViews(c.getPackageName(),R.layout.widget_weekday);
            label.setTextViewText(R.id.widget_weekday,names[day]);
            label.setTextColor(R.id.widget_weekday,cfg.flag("weekendColors",true)?day==0?sunday:day==6?saturday:muted:muted);
            root.addView(R.id.widget_weekdays,label);
        }
        for(int row=0;row<weeks;row++){
            RemoteViews week=new RemoteViews(c.getPackageName(),R.layout.widget_week);
            for(int col=0;col<7;col++){
                LocalDate day=first.plusDays(row*7L+col);
                boolean outside=day.getMonthValue()!=month.getMonthValue(),hidden=outside&&!cfg.flag("adjacentDays",true);
                boolean isToday=day.equals(today)&&cfg.flag("highlightToday",true);
                RemoteViews cell=new RemoteViews(c.getPackageName(),R.layout.widget_day);
                cell.setInt(R.id.widget_day_rule,"setColorFilter",fg);
                cell.setInt(R.id.widget_day_rule,"setImageAlpha",cfg.flag("grid",true)?35:0);
                cell.setInt(R.id.widget_day,"setBackgroundColor",isToday?((25<<24)|(accent&0xffffff)):Color.TRANSPARENT);
                cell.setTextViewText(R.id.widget_date,hidden?"":Integer.toString(day.getDayOfMonth()));
                cell.setTextViewTextSize(R.id.widget_date,TypedValue.COMPLEX_UNIT_SP,dateSize);
                int dow=day.getDayOfWeek().getValue()%7;
                int dateColor=isToday?accent:cfg.flag("weekendColors",true)?dow==0?sunday:dow==6?saturday:fg:fg;
                cell.setTextColor(R.id.widget_date,outside?blend(dateColor,bg,.64f):dateColor);
                cell.removeAllViews(R.id.widget_day_events);
                List<WidgetCalendar.Entry> list=hidden?Collections.emptyList():events.getOrDefault(day,Collections.emptyList());
                int shown=Math.min(slots,list.size());
                boolean overflow=cfg.flag("overflow",true)&&list.size()>slots;
                if(overflow&&shown>1)shown--;
                StringBuilder description=new StringBuilder(day.format(DateTimeFormatter.ofPattern("yyyy년 M월 d일 EEEE",Locale.KOREAN)));
                if(isToday)description.append(" 오늘");
                description.append(", 일정 ").append(list.size()).append("개");
                for(int i=0;i<Math.min(list.size(),5);i++)description.append(", ").append(list.get(i).title);
                cell.setContentDescription(R.id.widget_day,description.toString());
                for(int i=0;i<shown;i++){
                    WidgetCalendar.Entry event=list.get(i);
                    RemoteViews line=new RemoteViews(c.getPackageName(),R.layout.widget_event);
                    String title=(cfg.flag("showTime",false)&&!event.time.isEmpty()?event.time+" ":"")+event.title;
                    // Each title owns one native singleLine TextView; it never wraps.
                    line.setTextViewText(R.id.widget_event_title,title);
                    line.setTextViewTextSize(R.id.widget_event_title,TypedValue.COMPLEX_UNIT_SP,text);
                    int tint=color(event.color,0xffb59ae8);
                    String style=cfg.text("eventStyle","tint");
                    int fill=style.equals("solid")?tint:blend(tint,bg,.22f);
                    line.setInt(R.id.widget_event,"setBackgroundColor",style.equals("plain")?Color.TRANSPARENT:fill);
                    line.setViewVisibility(R.id.widget_event_color,View.VISIBLE);
                    line.setInt(R.id.widget_event_color,"setBackgroundColor",tint);
                    int ink=style.equals("plain")?fg:light(fill)?0xff161616:0xfff5f5f5;
                    line.setTextColor(R.id.widget_event_title,outside?blend(ink,bg,.72f):ink);
                    line.setContentDescription(R.id.widget_event,day+", "+title+", 일정 열기");
                    if(id>=0&&!event.key.isEmpty())line.setOnClickPendingIntent(R.id.widget_event,openEvent(c,id,day,event));
                    cell.addView(R.id.widget_day_events,line);
                }
                if(overflow && slots>1){
                    RemoteViews more=new RemoteViews(c.getPackageName(),R.layout.widget_event);
                    more.setTextViewText(R.id.widget_event_title,"+"+(list.size()-shown));
                    more.setTextViewTextSize(R.id.widget_event_title,TypedValue.COMPLEX_UNIT_SP,text);
                    more.setTextColor(R.id.widget_event_title,muted);
                    more.setContentDescription(R.id.widget_event,"일정 "+(list.size()-shown)+"개 더 보기");
                    if(id>=0)more.setOnClickPendingIntent(R.id.widget_event,openDay(c,id,day,"day"));
                    cell.addView(R.id.widget_day_events,more);
                }else if(overflow||slots==0&&!list.isEmpty()) {
                    cell.setTextViewText(R.id.widget_date,day.getDayOfMonth()+" +"+(list.size()-shown));
                }
                if(id>=0&&!hidden)cell.setOnClickPendingIntent(R.id.widget_day,openDay(c,id,day,cfg.text("tapAction","day")));
                week.addView(R.id.widget_week,cell);
            }
            root.addView(R.id.widget_weeks,week);
        }
        String status;
        if(data.optInt("version")==0)status="앱을 열고 일정을 동기화해 주세요";
        else if(!inRange)status="이 달의 일정은 앱에서 확인해 주세요";
        else if(data.optInt("failures")>0)status="일부 반복 일정 확인 필요 · 앱 열기";
        else if(data.optInt("pending")>0)status="기기에 저장됨 · "+data.optInt("pending")+"개 동기화 대기";
        else {
            long synced=data.optLong("lastSync");
            String stamp=synced>0?Instant.ofEpochMilli(synced).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("M/d HH:mm")):"아직 없음";
            status="동기화 "+stamp+" · 앱 열기";
        }
        root.setViewVisibility(R.id.widget_status,footer?View.VISIBLE:View.GONE);
        root.setTextViewText(R.id.widget_status,status);root.setTextColor(R.id.widget_status,muted);
        root.setContentDescription(R.id.widget_status,status+". 눌러 앱에서 서버와 동기화");
        if(id>=0)root.setOnClickPendingIntent(R.id.widget_status,openDay(c,id,inRange?today:month.atDay(1),inRange?"sync":"day"));
        return root;
    }
}
