package kr.threechan.calendar.widget;

import android.appwidget.*;
import android.content.*;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.os.*;
import android.view.*;
import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.widget.SwitchCompat;
import androidx.appcompat.widget.AppCompatButton;
import androidx.core.view.*;
import org.json.*;
import java.time.YearMonth;
import java.util.*;

public class WidgetConfigureActivity extends AppCompatActivity {
    private int widgetId=-1;
    private WidgetConfig draft;
    private LinearLayout content;
    private FrameLayout preview;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Runnable previewUpdate=this::renderPreview;
    private final int ink=0xffededed,muted=0xffaaaaaa,accent=0xffb59ae8;
    private int dp(float v){return WidgetRenderer.dp(this,v);}
    @Override public void onCreate(Bundle state){
        super.onCreate(state);setResult(RESULT_CANCELED);
        widgetId=getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1);
        if(widgetId>=0&&!CalendarWidgetProvider.owns(this,widgetId)){finish();return;}
        draft=WidgetConfig.load(this,widgetId).copy();
        if(state!=null)try{draft=new WidgetConfig(new JSONObject(state.getString("draft","{}")));}catch(Exception ignored){}
        WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
        build();
    }
    @Override public void onSaveInstanceState(Bundle out){out.putString("draft",draft.values.toString());super.onSaveInstanceState(out);}
    @Override public void onDestroy(){handler.removeCallbacks(previewUpdate);super.onDestroy();}
    private TextView text(String value,float sp,int color){
        TextView v=new TextView(this);v.setText(value);v.setTextSize(sp);v.setTextColor(color);v.setGravity(Gravity.CENTER_VERTICAL);return v;
    }
    private Button button(String value,Runnable action){
        Button b=new AppCompatButton(this);b.setText(value);b.setAllCaps(false);b.setTextColor(ink);b.setBackgroundTintList(ColorStateList.valueOf(0xff292929));b.setMinHeight(dp(48));b.setOnClickListener(v->action.run());return b;
    }
    private void build(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(0xff111111);
        ViewCompat.setOnApplyWindowInsetsListener(root,(v,insets)->{
            androidx.core.graphics.Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());
            v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;
        });
        LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);header.setPadding(dp(16),0,dp(8),0);
        TextView title=text(widgetId<0?"홈 화면에 달력 추가":"위젯 설정",20,ink);title.setTypeface(null,1);
        header.addView(title,new LinearLayout.LayoutParams(0,dp(56),1));header.addView(button("닫기",this::finish));root.addView(header);
        TextView hint=text("크기를 늘리면 날짜마다 더 많은 일정이 보여요.",12,muted);hint.setPadding(dp(20),0,dp(16),dp(4));root.addView(hint);
        preview=new FrameLayout(this);preview.setPadding(dp(12),0,dp(12),0);
        int previewHeight=WidgetRenderer.previewHeight(this,draft,YearMonth.now());
        boolean shortScreen=getResources().getConfiguration().screenHeightDp<650;
        if(!shortScreen)root.addView(preview,new LinearLayout.LayoutParams(-1,dp(previewHeight)));
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(false);scroll.setClipToPadding(false);
        content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(20),dp(4),dp(20),dp(24));scroll.addView(content);
        if(shortScreen)content.addView(preview,new LinearLayout.LayoutParams(-1,dp(previewHeight)));
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        section("표시할 일정");
        actionRow("캘린더 선택",calendarSummary(),this::selectCalendars);
        toggle("종일 일정","하루 종일인 일정과 여러 날에 걸친 일정","allDay",true);
        toggle("시간 일정","시작·종료 시간이 있는 일정","timed",true);
        toggle("종일 일정 먼저","같은 날에는 종일 일정부터 정렬","allDayFirst",true);
        toggle("시작 시간 표시","제목 앞에 09:00처럼 표시","showTime",false);
        section("글자와 표시 개수");
        slider("일정 글자 크기","textSize",11,8,16,"sp");
        slider("날짜 글자 크기","dateSize",12,10,20,"sp");
        choice("하루 일정 개수","maxLines",new String[]{"높이에 맞춰 자동","최대 1개","최대 2개","최대 3개","최대 4개","최대 5개","최대 6개","최대 7개","최대 8개"},new Object[]{0,1,2,3,4,5,6,7,8},0);
        toggle("숨겨진 일정 개수","공간이 부족하면 +3처럼 표시","overflow",true);
        TextView truncation=text("긴 제목은 한 줄에서 잘려요. 날짜를 누르면 전체 일정을 볼 수 있어요.",12,muted);truncation.setPadding(0,dp(8),0,dp(4));content.addView(truncation);
        section("달력 배치");
        choice("한 주의 시작","weekStart",new String[]{"일요일","월요일","토요일"},new Object[]{0,1,6},0);
        toggle("항상 6주 표시","끄면 해당 월에 맞춰 4~6주로 넓게 사용","fixedWeeks",false);
        toggle("앞뒤 달 날짜 표시","이번 달 밖의 날짜와 일정을 흐리게 표시","adjacentDays",true);
        toggle("주말 색상","일요일은 붉게, 토요일은 파랗게 표시","weekendColors",true);
        toggle("오늘 강조","오늘 날짜와 칸에 강조색 적용","highlightToday",true);
        toggle("날짜 구분선","날짜 칸 사이에 얇은 선 표시","grid",true);
        slider("바깥 여백","padding",3,0,10,"dp");
        section("색상과 배경");
        choice("테마","theme",new String[]{"노트와 같은 어두운 테마","밝은 테마","시스템 설정에 맞춤"},new Object[]{"dark","light","system"},"dark");
        choice("일정 색상 표현","eventStyle",new String[]{"은은한 캘린더 색상","진한 캘린더 색상","배경 없이 글자만"},new Object[]{"tint","solid","plain"},"tint");
        slider("배경 불투명도","opacity",100,0,100,"%");
        choice("모서리","corners",new String[]{"둥글게","조금 둥글게","직각"},new Object[]{"round","soft","square"},"round");
        toggle("배경색 직접 지정","테마 배경 대신 선택한 색 사용","customBackground",false);
        actionRow("사용자 배경색",draft.text("backgroundColor","#141414"),()->pickColor("backgroundColor","배경색","#141414"));
        actionRow("오늘 강조색",draft.text("accent","#b59ae8"),()->pickColor("accent","오늘 강조색","#b59ae8"));
        section("동작과 갱신");
        choice("날짜를 누르면","tapAction",new String[]{"해당 날짜 일정 보기","해당 날짜에 새 일정 작성"},new Object[]{"day","new"},"day");
        choice("다른 달 보기 유지","returnMinutes",new String[]{"15분 후 이번 달로","1시간 후 이번 달로","직접 오늘을 누를 때까지"},new Object[]{15,60,0},15);
        toggle("동기화 시각 표시","아래쪽 상태를 누르면 앱에서 동기화","footer",true);
        TextView info=text("앱에 저장된 일정을 표시해요. 앱에서 수정·동기화하면 바로 반영되며, 앱을 닫아도 마지막 일정은 남아요. 날짜는 자동으로 갱신돼요.\n\n현재 달 기준 앞뒤 2년을 보관해요. 그 밖의 달은 앱에서 확인할 수 있어요. 배경을 투명하게 하면 배경화면에 따라 글자가 잘 안 보일 수 있어요.",12,muted);info.setPadding(0,dp(10),0,dp(12));content.addView(info);
        content.addView(button("이 위젯 설정을 기본값으로 되돌리기",()->new AlertDialog.Builder(this).setTitle("기본 설정으로 되돌릴까요?").setMessage("저장하기 전에는 홈 화면 위젯이 바뀌지 않아요.").setNegativeButton("취소",null).setPositiveButton("되돌리기",(d,w)->{draft=new WidgetConfig(new JSONObject());build();}).show()));
        LinearLayout bottom=new LinearLayout(this);bottom.setPadding(dp(16),dp(4),dp(16),dp(8));
        Button save=button(widgetId<0?"홈 화면에 추가":"설정 저장",this::save);save.setBackgroundTintList(ColorStateList.valueOf(accent));save.setTextColor(0xff17111f);
        bottom.addView(save,new LinearLayout.LayoutParams(-1,dp(52)));root.addView(bottom);
        setContentView(root);preview.post(this::renderPreview);
    }
    private void changed(){handler.removeCallbacks(previewUpdate);handler.postDelayed(previewUpdate,140);}
    private void renderPreview(){
        if(preview==null||preview.getWidth()==0)return;
        try{
            float density=getResources().getDisplayMetrics().density;
            float width=(preview.getWidth()-preview.getPaddingLeft()-preview.getPaddingRight())/density;
            int height=WidgetRenderer.previewHeight(this,draft,YearMonth.now());
            if(preview.getLayoutParams().height!=dp(height)){ViewGroup.LayoutParams params=preview.getLayoutParams();params.height=dp(height);preview.setLayoutParams(params);}
            // AppCompat's inflater substitutes views that RemoteViews does not allow.
            View view=WidgetRenderer.render(this,-1,draft,WidgetStore.read(this),width,height,YearMonth.now()).apply(getApplicationContext(),preview);
            preview.removeAllViews();preview.addView(view,new FrameLayout.LayoutParams(-1,-1));
        }catch(Exception e){android.util.Log.e("CalendarWidget","Unable to render widget preview",e);preview.removeAllViews();preview.addView(text("미리보기를 표시하지 못했어요. 설정을 닫았다 다시 열어 주세요.",13,muted));}
    }
    private void section(String name){TextView h=text(name,15,ink);h.setTypeface(null,1);h.setPadding(0,dp(22),0,dp(10));content.addView(h);}
    private void toggle(String title,String subtitle,String key,boolean fallback){
        LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.setMinimumHeight(dp(60));
        LinearLayout words=new LinearLayout(this);words.setOrientation(LinearLayout.VERTICAL);words.setPadding(0,dp(7),dp(12),dp(7));
        words.addView(text(title,14,ink));words.addView(text(subtitle,11,muted));row.addView(words,new LinearLayout.LayoutParams(0,-2,1));
        SwitchCompat control=new SwitchCompat(this);control.setContentDescription(title);control.setChecked(draft.flag(key,fallback));control.setMinHeight(dp(48));
        control.setOnCheckedChangeListener((v,checked)->{draft.set(key,checked);changed();});row.addView(control);row.setOnClickListener(v->control.setChecked(!control.isChecked()));content.addView(row);
    }
    private void slider(String title,String key,int fallback,int min,int max,String unit){
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(0,dp(8),0,dp(8));
        TextView label=text(title+" · "+draft.number(key,fallback,min,max)+unit,14,ink);box.addView(label);
        SeekBar seek=new SeekBar(this);seek.setMax(max-min);seek.setProgress(draft.number(key,fallback,min,max)-min);seek.setContentDescription(title);seek.setMinimumHeight(dp(48));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
            public void onProgressChanged(SeekBar v,int progress,boolean user){if(user){draft.set(key,progress+min);label.setText(title+" · "+(progress+min)+unit);changed();}}
            public void onStartTrackingTouch(SeekBar v){} public void onStopTrackingTouch(SeekBar v){}
        });box.addView(seek,new LinearLayout.LayoutParams(-1,dp(48)));content.addView(box);
    }
    private void choice(String title,String key,String[] labels,Object[] values,Object fallback){
        TextView label=text(title,14,ink);label.setPadding(0,dp(10),0,0);content.addView(label);
        Spinner spinner=new Spinner(this);spinner.setContentDescription(title);
        ArrayAdapter<String> adapter=new ArrayAdapter<String>(this,android.R.layout.simple_spinner_item,labels){
            @Override public View getView(int p,View reuse,ViewGroup parent){TextView v=(TextView)super.getView(p,reuse,parent);v.setTextColor(ink);v.setTextSize(14);v.setSingleLine(false);return v;}
        };adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);spinner.setAdapter(adapter);
        String current=draft.text(key,String.valueOf(fallback));int selected=0;for(int i=0;i<values.length;i++)if(String.valueOf(values[i]).equals(current))selected=i;
        spinner.setSelection(selected);spinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){
            public void onItemSelected(AdapterView<?> p,View v,int position,long id){draft.set(key,values[position]);changed();}public void onNothingSelected(AdapterView<?> p){}
        });content.addView(spinner,new LinearLayout.LayoutParams(-1,dp(48)));
    }
    private void actionRow(String title,String value,Runnable action){
        Button b=button(title+"\n"+value,action);b.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);b.setTextSize(13);b.setPadding(dp(12),dp(8),dp(12),dp(8));content.addView(b,new LinearLayout.LayoutParams(-1,-2));
    }
    private String calendarSummary(){return draft.flag("allCalendars",true)?"모든 캘린더 · 새 캘린더도 포함":draft.selected().size()+"개 캘린더 선택";}
    private void selectCalendars(){
        JSONArray raw=WidgetStore.read(this).optJSONArray("calendars");
        if(raw==null||raw.length()==0){new AlertDialog.Builder(this).setMessage("앱에서 먼저 동기화하면 선택할 캘린더가 나타나요.").setPositiveButton("확인",null).show();return;}
        String[] names=new String[raw.length()+1];boolean[] checked=new boolean[names.length];names[0]="모든 캘린더 (새로 추가한 캘린더 포함)";checked[0]=draft.flag("allCalendars",true);
        for(int i=0;i<raw.length();i++){JSONObject cal=raw.optJSONObject(i);names[i+1]=cal.optString("name");checked[i+1]=checked[0]||draft.selected().contains(cal.optString("id"));}
        new AlertDialog.Builder(this).setTitle("표시할 캘린더").setMultiChoiceItems(names,checked,(d,index,isChecked)->{
            checked[index]=isChecked;ListView list=((AlertDialog)d).getListView();
            if(index==0){for(int i=1;i<checked.length;i++){checked[i]=isChecked;list.setItemChecked(i,isChecked);}}
            else{checked[0]=false;list.setItemChecked(0,false);}
        }).setNegativeButton("취소",null).setPositiveButton("선택",(d,w)->{
            JSONArray ids=new JSONArray();for(int i=1;i<checked.length;i++)if(checked[i])ids.put(raw.optJSONObject(i-1).optString("id"));
            draft.set("allCalendars",checked[0]);draft.set("calendarIds",ids);build();
        }).show();
    }
    private void pickColor(String key,String title,String fallback){
        EditText input=new EditText(this);input.setSingleLine(true);input.setText(draft.text(key,fallback));input.setSelectAllOnFocus(true);input.setHint("#RRGGBB");
        FrameLayout holder=new FrameLayout(this);holder.setPadding(dp(24),dp(8),dp(24),0);holder.addView(input);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle(title).setView(holder).setNegativeButton("취소",null).setPositiveButton("적용",null).create();
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            String value=input.getText().toString().trim();if(!value.matches("#[0-9a-fA-F]{6}")){input.setError("# 뒤에 색상 코드 6자리를 입력해 주세요.");return;}
            draft.set(key,value);dialog.dismiss();build();
        }));dialog.show();
    }
    private void save(){
        if(widgetId>=0){
            if(!CalendarWidgetProvider.owns(this,widgetId)){finish();return;}
            draft.save(this,widgetId);CalendarWidgetProvider.update(this,widgetId);
            setResult(RESULT_OK,new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,widgetId));finish();return;
        }
        draft.save(this,-1);
        AppWidgetManager manager=AppWidgetManager.getInstance(this);
        if(Build.VERSION.SDK_INT>=26 && manager.isRequestPinAppWidgetSupported()){
            Bundle extras=new Bundle();extras.putParcelable(AppWidgetManager.EXTRA_APPWIDGET_PREVIEW,WidgetRenderer.render(this,-1,draft,WidgetStore.read(this),320,430,YearMonth.now()));
            boolean requested=manager.requestPinAppWidget(new ComponentName(this,CalendarWidgetProvider.class),extras,null);
            if(requested){finish();return;}
        }
        new AlertDialog.Builder(this).setTitle("홈 화면에서 추가해 주세요").setMessage("설정을 저장했어요. 홈 화면의 빈 곳을 길게 누르고 위젯 → 달력 → 일정 달력을 선택해 주세요.").setPositiveButton("확인",(d,w)->finish()).show();
    }
}
