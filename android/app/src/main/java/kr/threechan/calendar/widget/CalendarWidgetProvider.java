package kr.threechan.calendar.widget;

import android.appwidget.*;
import android.content.*;
import android.os.*;
import android.util.SizeF;
import android.widget.RemoteViews;
import java.time.YearMonth;
import java.util.*;

public class CalendarWidgetProvider extends AppWidgetProvider {
    public static final String ACTION_PREFIX="kr.threechan.calendar.widget.";
    public static boolean owns(Context c,int id) {
        AppWidgetProviderInfo info=AppWidgetManager.getInstance(c).getAppWidgetInfo(id);
        return info!=null&&info.provider.equals(new ComponentName(c,CalendarWidgetProvider.class));
    }
    public static YearMonth month(Context c,int id,WidgetConfig cfg) {
        long time=WidgetConfig.prefs(c).getLong("navigation."+id,0);
        int keep=cfg.number("returnMinutes",15,0,1440);
        if(time>0&&(keep==0||System.currentTimeMillis()-time<keep*60000L)){
            try{return YearMonth.parse(WidgetConfig.prefs(c).getString("month."+id,""));}catch(Exception ignored){}
        }
        return YearMonth.now();
    }
    public static void update(Context c,int id) {
        if(!owns(c,id))return;
        WidgetConfig.ensure(c,id);
        WidgetConfig cfg=WidgetConfig.load(c,id);
        AppWidgetManager manager=AppWidgetManager.getInstance(c);
        Bundle options=manager.getAppWidgetOptions(id);
        YearMonth month=month(c,id,cfg);
        if(Build.VERSION.SDK_INT>=31){
            ArrayList<SizeF> sizes=options.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
            if(sizes!=null&&!sizes.isEmpty()){
                Map<SizeF,RemoteViews> views=new LinkedHashMap<>();
                for(SizeF size:sizes){
                    if(views.size()>=4)break;
                    views.put(size,WidgetRenderer.render(c,id,cfg,WidgetStore.read(c),size.getWidth(),size.getHeight(),month));
                }
                manager.updateAppWidget(id,new RemoteViews(views));return;
            }
        }
        float width=Math.max(200,options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,320));
        float height=Math.max(140,options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,430));
        manager.updateAppWidget(id,WidgetRenderer.render(c,id,cfg,WidgetStore.read(c),width,height,month));
    }
    public static void updateAll(Context c){
        for(int id:AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c,CalendarWidgetProvider.class)))update(c,id);
    }
    @Override public void onUpdate(Context c,AppWidgetManager manager,int[] ids){for(int id:ids)update(c,id);}
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager manager,int id,Bundle options){update(c,id);}
    @Override public void onDeleted(Context c,int[] ids){for(int id:ids)WidgetConfig.delete(c,id);}
    @Override public void onRestored(Context c,int[] oldIds,int[] newIds){
        for(int i=0;i<Math.min(oldIds.length,newIds.length);i++){WidgetConfig.load(c,oldIds[i]).save(c,newIds[i]);WidgetConfig.delete(c,oldIds[i]);}
    }
    @Override public void onReceive(Context c,Intent intent){
        super.onReceive(c,intent);
        String action=intent.getAction();
        if(action==null)return;
        if(action.equals(ACTION_PREFIX+"NEXT")||action.equals(ACTION_PREFIX+"PREVIOUS")||action.equals(ACTION_PREFIX+"TODAY")){
            int id=intent.getIntExtra("appWidgetId",-1);if(!owns(c,id))return;
            YearMonth current=month(c,id,WidgetConfig.load(c,id));
            YearMonth next=action.endsWith("TODAY")?YearMonth.now():current.plusMonths(action.endsWith("NEXT")?1:-1);
            if(next.getYear()<1900||next.getYear()>2200)return;
            WidgetConfig.prefs(c).edit().putString("month."+id,next.toString()).putLong("navigation."+id,action.endsWith("TODAY")?0:System.currentTimeMillis()).apply();update(c,id);
        }else if(action.equals(Intent.ACTION_DATE_CHANGED)||action.equals(Intent.ACTION_TIME_CHANGED)||action.equals(Intent.ACTION_TIMEZONE_CHANGED)||action.equals(Intent.ACTION_BOOT_COMPLETED)||action.equals(Intent.ACTION_MY_PACKAGE_REPLACED))updateAll(c);
    }
}
