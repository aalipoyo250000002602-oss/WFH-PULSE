"""Render the WFH Pulse promo using local assets. Python + Pillow + NumPy + imageio-ffmpeg."""
from pathlib import Path
import math
import subprocess
import wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent
W, H, FPS, DURATION = 1920, 1080, 30, 30
NAVY = '#0B1630'
WHITE = '#F6F8FF'
MUTED = '#A9B8D6'
BLUE = '#548AFF'
ORANGE = '#FF815E'
GREEN = '#50D6B0'
FONT_DIR = Path('C:/Windows/Fonts')
FONTS = {}

def font(size, bold=False):
    key = (size, bold)
    if key not in FONTS:
        FONTS[key] = ImageFont.truetype(str(FONT_DIR / ('segoeuib.ttf' if bold else 'segoeui.ttf')), size)
    return FONTS[key]

def text(d, xy, value, size=32, color=WHITE, bold=False):
    d.text(tuple(int(v) for v in xy), value, fill=color, font=font(size, bold))

def box(d, rect, fill, radius=24, outline=None):
    d.rounded_rectangle(tuple(int(v) for v in rect), radius, fill=fill, outline=outline, width=2)

def ease(x):
    x = max(0, min(1, x))
    return 1 - (1-x)**3

def pulse(d, x, y, color=BLUE, scale=1, progress=1):
    pts = [(0, 45), (54, 45), (73, 20), (93, 76), (116, 0), (143, 98), (166, 45), (232, 45)]
    pts = [(x+a*scale, y+b*scale) for a,b in pts]
    n = max(2, int(len(pts)*progress))
    d.line(pts[:n], fill=color, width=max(2,int(7*scale)), joint='curve')

def tag(d, x, y, value, color=GREEN, bg='#153B3D', width=190):
    box(d, (x,y,x+width,y+46), bg, 23)
    text(d, (x+19,y+5), value, 23, color, True)

def check(d,x,y,color=GREEN):
    d.line([(x,y+8),(x+9,y+17),(x+27,y-3)], fill=color, width=5, joint='curve')

def cursor(d,x,y,click_age=-1):
    if 0 <= click_age < .65:
        r=18+click_age*90
        d.ellipse((x-r,y-r,x+r,y+r),outline=BLUE,width=4)
    pts=[(x,y),(x+10,y+40),(x+20,y+28),(x+34,y+28)]
    d.polygon(pts,fill=NAVY,outline='white',width=3)

def equalizer(d,x,y,t,width=420):
    for i in range(35):
        h=12+60*abs(math.sin(t*5.8+i*.48))*abs(math.cos(t*2.4-i*.23))
        box(d,(x+i*width/35,y-h,x+i*width/35+6,y+h),BLUE if i%3 else ORANGE,3)

yy, xx = np.mgrid[0:H,0:W]
glow = np.exp(-(((xx-1530)/770)**2 + ((yy-370)/680)**2))
base = np.empty((H,W,3), dtype=np.uint8)
for c,(a,b) in enumerate([(8,16),(16,29),(35,65)]):
    base[:,:,c] = a + glow*b
BG = Image.fromarray(base)
logo = Image.open(ROOT/'src/assets/logo.png').convert('RGBA')
logo.thumbnail((98,98), Image.Resampling.LANCZOS)

def base_frame(t, section):
    im = BG.copy()
    d = ImageDraw.Draw(im)
    for x in range(80,W,80):
        for y in range(160,H-100,80):
            px=x+12*math.sin(t*.5+y*.01)
            py=y+8*math.cos(t*.6+x*.006)
            d.ellipse((px,py,px+2,py+2), fill='#223454')
    for i in range(14):
        px=80+(i*149+t*(16+i%3*8))%1760
        py=190+(i*97)%750+15*math.sin(t+i)
        d.line((px,py,px+18,py),fill='#30496E',width=2)
    im.paste(logo,(72,35),logo)
    text(d,(183,59),'WFH PULSE',32,WHITE,True)
    text(d,(1470,66),'EMPOWERING REMOTE TEAMS',19,MUTED)
    d.line((80,152,1840,152),fill='#263753',width=2)
    text(d,(80,1008),'REMOTE WORK. IN RHYTHM.',20,MUTED)
    text(d,(1605,1008),section,20,MUTED)
    d.rectangle((80,1054,1840,1057),fill='#29364C')
    d.rectangle((80,1054,80+1760*t/DURATION,1057),fill=BLUE)
    return im,d

def heading(d,u,kicker,lines,sub):
    y = int(80*(1-ease(u/0.65)))
    text(d,(100,243+y),kicker,23,ORANGE,True)
    for i,line in enumerate(lines):
        slide=int(160*(1-ease((u-i*.16)/.7)))
        text(d,(95-slide,300+i*103+y),line,85,WHITE,True)
    for i,line in enumerate(sub):
        text(d,(100,560+i*45+y),line,30,MUTED)

def panel(d,u,title,subtitle):
    x,y = int(1010+230*(1-ease(u/.8))),int(242+12*math.sin(u*1.7))
    box(d,(x+13,y+20,x+813,y+665),'#071124',32)
    box(d,(x,y,x+800,y+645),'#F7F9FF',30)
    text(d,(x+36,y+28),title,32,NAVY,True)
    text(d,(x+36,y+80),subtitle,22,'#72809A')
    text(d,(x+36,y+602),'ILLUSTRATIVE PRODUCT DEMO',15,'#7F8CA5')
    return x,y

def frame(t):
    if t < 5:
        u=t
        im,d=base_frame(t,'01 / CONNECT')
        heading(d,u,'YOUR TEAM. EVERYWHERE.',['One shared','pulse.'],['Bring attendance, requests, and team','insights into one workspace.'])
        cx,cy=1415,540
        for r in (160,238,310):
            r+=8*math.sin(t*3-r*.01)
            d.ellipse((cx-r,cy-r,cx+r,cy+r),outline='#2B4167',width=2)
            a=t*1.1+r*.02
            ox=cx+r*math.cos(a); oy=cy+r*math.sin(a)
            d.ellipse((ox-7,oy-7,ox+7,oy+7),fill=BLUE)
        for i,(label,col) in enumerate([('Attendance',BLUE),('Requests',ORANGE),('Insights',GREEN)]):
            a=i*2.094+t*.38-1.4
            x=cx+math.cos(a)*242; y=cy+math.sin(a)*242
            box(d,(x-115,y-35,x+115,y+35),'#192D4E',30, '#38517A')
            text(d,(x-90,y-21),label,28,col,True)
        box(d,(cx-126,cy-115,cx+126,cy+115),'#152B4C',42, '#48689B')
        pulse(d,cx-104,cy-42,ORANGE,.9+.035*math.sin(t*13.4),ease(u/1.0))
        text(d,(cx-84,cy+48),'IN SYNC',28,WHITE,True)
        equalizer(d,100,786,t)
    elif t < 11:
        u=t-5
        im,d=base_frame(t,'02 / ATTENDANCE')
        heading(d,u,'EVERY WORKDAY, SIMPLIFIED.',['Clock in.','Get going.'],['Track work time and breaks.','Keep attendance easy to follow.'])
        x,y=panel(d,u,'Your workday','Attendance / Today')
        box(d,(x+35,y+134,x+765,y+366),'#EAF0FF',22)
        text(d,(x+65,y+158),'WORK DURATION',20,'#617291',True)
        seconds=int(32+u*6)
        text(d,(x+61,y+191),f'04:{32+seconds//60:02d}:{seconds%60:02d}',77,NAVY,True)
        text(d,(x+67,y+301),'Clocked in at 9:00 AM',24,'#617291')
        on_break=u>3.0
        tag(d,x+546,y+159,'On break' if on_break else 'Clocked in','#19765F','#D6F3E8',185)
        box(d,(x+35,y+396,x+386,y+467),'#315FE8',15)
        text(d,(x+99,y+408),'Resume work' if on_break else 'Take a break',29,'white',True)
        box(d,(x+409,y+396,x+765,y+467),'#E8ECF5',15)
        text(d,(x+519,y+408),'Clock out',29,NAVY,True)
        if u>1.3:
            check(d,x+48,y+532,'#26997C')
            text(d,(x+91,y+515),'Your attendance is recorded.',25,NAVY)
        cp=ease((u-1.8)/1.2)
        cursor(d,x+695-480*cp,y+560-125*cp,u-3)
        # A continuously moving clock makes the time-tracking story visible.
        ccx,ccy=200,793
        d.ellipse((ccx-73,ccy-73,ccx+73,ccy+73),outline=BLUE,width=5)
        for angle,length,col in [(u*1.6,58,ORANGE),(u*.15-1.5,40,WHITE)]:
            d.line((ccx,ccy,ccx+math.cos(angle)*length,ccy+math.sin(angle)*length),fill=col,width=6)
        text(d,(310,755),'Your day, in motion.',30,WHITE,True)
        text(d,(310,803),'Clock in. Break. Resume.',25,MUTED)
    elif t < 17:
        u=t-11
        im,d=base_frame(t,'03 / REQUESTS')
        heading(d,u,'LESS BACK-AND-FORTH.',['Requests,','all together.'],['Manage leave, overtime, and','attendance adjustments in one place.'])
        x,y=panel(d,u,'Team requests','A clear view of what needs attention')
        approved=u>2.3
        for i,(name,detail) in enumerate([('Annual leave','2 days  /  Nov 12 - 13'),('Overtime','2 hours  /  Oct 23'),('Attendance adjustment','Clock-in correction  /  Oct 21')]):
            ry=y+138+i*139+int(100*(1-ease((u-i*.18)/.65)))
            box(d,(x+35,ry,x+765,ry+118),'#FFFFFF',18,'#E3E8F1')
            text(d,(x+58,ry+15),name,29,NAVY,True)
            text(d,(x+58,ry+62),detail,22,'#72809A')
            if i==0 and approved:
                tag(d,x+552,ry+35,'Approved','#19765F','#D6F3E8',183)
            else:
                tag(d,x+552,ry+35,'Pending','#A56921','#FFF0D9',183)
        cp=ease((u-.9)/1.4)
        cursor(d,x+350+300*cp,y+550-335*cp,u-2.3)
        for i,label in enumerate(['SUBMIT','REVIEW','APPROVE']):
            sx=100+i*267
            active=u>i*.9
            box(d,(sx,735,sx+232,808),'#183D49' if active else '#182640',18)
            text(d,(sx+28,756),label,24,GREEN if active else MUTED,True)
            if i<2: text(d,(sx+241,754),'>',26,MUTED)
        if 2.3<u<3.2:
            for i in range(16):
                a=i*2.4; r=(u-2.3)*160
                px=x+650+math.cos(a)*r; py=y+210+math.sin(a)*r
                d.ellipse((px,py,px+6,py+6),fill=GREEN if i%2 else BLUE)
    elif t < 23:
        u=t-17
        im,d=base_frame(t,'04 / TEAM INSIGHTS')
        heading(d,u,'SEE THE BIGGER PICTURE.',['Less guesswork.','More clarity.'],['See attendance trends.','Keep your remote team in view.'])
        x,y=panel(d,u,'Team overview','Attendance insights / Sample week')
        for i,(value,label,col) in enumerate([('24','Team members',BLUE),('21','Present','#26997C'),('03','On leave','#B67B2E')]):
            sx=x+35+i*248
            box(d,(sx,y+134,sx+232,y+263),'#EBF0F9',18)
            counter=int(int(value)*ease((u-i*.18)/1.2))
            text(d,(sx+20,y+144),f'{counter:02d}',49,col,True)
            text(d,(sx+20,y+214),label,20,'#72809A')
        text(d,(x+40,y+290),'Weekly attendance',26,NAVY,True)
        for i,(label,v) in enumerate(zip(['MON','TUE','WED','THU','FRI'],[.73,.85,.78,.95,.88])):
            p=ease((u-i*.22)/1.1)
            bx=x+82+i*140
            box(d,(bx,y+355,bx+68,y+535),'#E7ECF6',13)
            box(d,(bx,y+535-180*v*p,bx+68,y+535),['#548AFF','#719EFF','#548AFF','#4279F1','#548AFF'][i],13)
            text(d,(bx+4,y+548),label,18,'#72809A',True)
        hx=x+116+min(4,max(0,int((u-1.8)*1.5)))*140
        if u>1.8:
            d.ellipse((hx-7,y+333,hx+7,y+347),fill=ORANGE)
        equalizer(d,100,790,t)
    else:
        u=t-23
        im,d=base_frame(t,'05 / WFH PULSE')
        # Deliberately spacious closing card keeps the destination readable.
        text(d,(100,238),'BUILT FOR YOUR REMOTE TEAM.',24,ORANGE,True)
        text(d,(94+int(180*(1-ease(u/.7))),296),'Work from anywhere.',100,WHITE,True)
        text(d,(94+int(220*(1-ease((u-.2)/.7))),414),'Stay in sync.',100,WHITE,True)
        text(d,(100,570),'Attendance. Requests. Team insights.',36,MUTED)
        r=5+int(4*math.sin(u*4))
        box(d,(100-r,687-r,458+r,775+r),'#284D92',25)
        box(d,(100,687,458,775),BLUE,22)
        text(d,(142,701),'Explore the demo',32,'white',True)
        text(d,(100,817),'aalipoyo250000002602-oss.github.io/WFH-PULSE/',30,WHITE)
        pulse(d,1450,645,ORANGE,1.3,ease(u/1.1))
        text(d,(1450,910),'WFH PULSE',38,WHITE,True)
        equalizer(d,1410,835,t,360)
    # Brief dip transitions between chapters; hold the end card through the final frame.
    cuts=[5,11,17,23]
    # Quick moving blue slashes carry each chapter into the next.
    for cut in cuts:
        age=t-cut
        if -.22<age<.3:
            sx=int(-700+(age+.22)/.52*3400)
            d.polygon([(sx,0),(sx+480,0),(sx-40,H),(sx-520,H)],fill=BLUE)
            d.polygon([(sx+520,0),(sx+570,0),(sx+50,H),(sx,H)],fill=ORANGE)
    dip=max(0,1-t/.22)
    if dip>0:
        im=Image.blend(im,Image.new('RGB',(W,H),NAVY),dip)
    return im

def soundtrack():
    """Original 128 BPM electronic groove with bass, claps, synth hook and risers."""
    sr=44100
    n=sr*DURATION
    drums=np.zeros((n,2),dtype=np.float64)
    synth=np.zeros((n,2),dtype=np.float64)
    rng=np.random.default_rng(19)
    beat=60/128
    def add(track,start,signal,pan=0):
        a=int(start*sr); b=min(n,a+len(signal))
        if a<0 or a>=n: return
        sig=signal[:b-a]
        track[a:b,0]+=sig*math.sqrt((1-pan)/2)
        track[a:b,1]+=sig*math.sqrt((1+pan)/2)
    def timeline(duration): return np.arange(int(duration*sr))/sr
    def hz(midi): return 440*2**((midi-69)/12)
    chords=[(57,60,64),(53,57,60),(60,64,67),(55,59,62)]
    roots=[33,29,36,31]
    for b in range(math.ceil(DURATION/beat)):
        start=b*beat
        tt=timeline(.42)
        kick=np.sin(2*np.pi*(48*tt+5*(1-np.exp(-tt*38))))*np.exp(-tt*13)
        kick+=rng.normal(0,1,len(tt))*.12*np.exp(-tt*230)
        add(drums,start,kick*.7)
        if b%2==1:
            tt=timeline(.24)
            noise=rng.normal(0,1,len(tt))
            high=noise-np.roll(noise,1)*.75
            env=sum(np.exp(-np.maximum(tt-delay,0)*75)*(tt>=delay) for delay in [0,.012,.027])
            add(drums,start,high*env*.12)
        for sub in range(4):
            tt=timeline(.065 if sub!=2 else .16)
            noise=rng.normal(0,1,len(tt)); high=np.diff(noise,prepend=0)
            add(drums,start+sub*beat/4,high*np.exp(-tt*(85 if sub!=2 else 28))*(.035 if sub%2 else .06),(-1)**sub*.48)
        # Syncopated octave bass, giving the groove much more forward movement.
        root=roots[(b//4)%4]
        for off,octave in [(.0,0),(.75,12)]:
            tt=timeline(beat*.38)
            f=hz(root+octave)
            tone=np.sin(2*np.pi*f*tt)+.35*np.sin(2*np.pi*2*f*tt)+.14*np.sin(2*np.pi*3*f*tt)
            env=np.minimum(tt/.008,1)*np.exp(-tt*9)
            add(synth,start+off*beat,tone*env*.26)
    for bar in range(math.ceil(DURATION/(4*beat))):
        chord=chords[bar%4]
        for off in [0,1.5,2.5,3.5]:
            tt=timeline(.34)
            tone=np.zeros(len(tt))
            for midi in chord:
                f=hz(midi)
                for detune in [.997,1.003]:
                    tone+=sum(np.sin(2*np.pi*f*detune*h*tt)/h**1.55 for h in range(1,7))
            env=np.minimum(tt/.008,1)*np.exp(-tt*10)
            add(synth,bar*4*beat+off*beat,tone*env*.045,math.sin(bar)*.3)
        # Repeating melodic hook, with variation in the second half of each phrase.
        hook=([76,79,81,79,76,72,74,76] if bar%2==0 else [72,76,79,83,81,79,76,74])
        if bar>0:
            for j,midi in enumerate(hook):
                tt=timeline(.27)
                f=hz(midi)
                tone=np.sin(2*np.pi*f*tt)+.22*np.sin(2*np.pi*2*f*tt)+.08*np.sin(2*np.pi*3*f*tt)
                env=np.minimum(tt/.006,1)*np.exp(-tt*14)
                start=bar*4*beat+j*beat/2
                add(synth,start,tone*env*.115,math.sin(j)*.4)
                add(synth,start+beat*.75,tone*env*.032,-math.sin(j)*.6)
        # A short drum fill every fourth bar.
        if bar%4==3:
            for j in range(4):
                tt=timeline(.09)
                add(drums,(bar*4+3)*beat+j*beat/4,rng.normal(0,1,len(tt))*np.exp(-tt*55)*.09, (j-1.5)/4)
    for cut in [5,11,17,23]:
        tt=timeline(.7)
        noise=rng.normal(0,1,len(tt))
        # Stereo sweep and impact accompany the visual wipe.
        sweep=(noise+np.roll(noise,1)+np.roll(noise,2))/3
        add(drums,cut-.7,sweep*(tt/.7)**2*.17,-.35)
        tt=timeline(.6)
        add(drums,cut,np.sin(2*np.pi*62*tt)*np.exp(-tt*9)*.24)
    ts=np.arange(n)/sr
    duck=.48+.52*np.minimum((ts%beat)/(.2*beat),1)
    mix=drums+synth*duck[:,None]
    mix*=np.minimum(ts/.12,1)[:,None]*np.minimum((DURATION-ts)/.65,1)[:,None]
    stereo=np.tanh(mix*1.25)
    stereo*=.94/max(.94,float(np.max(np.abs(stereo))))
    path=OUT/'soundtrack-energetic.wav'
    with wave.open(str(path),'wb') as f:
        f.setnchannels(2); f.setsampwidth(2); f.setframerate(sr)
        f.writeframes((stereo*32767).astype('<i2').tobytes())
    return path

def main():
    OUT.mkdir(exist_ok=True)
    thumbs=[]
    for t in [2.7,8,14.5,20,26]:
        thumb=frame(t); thumb.thumbnail((640,360),Image.Resampling.LANCZOS); thumbs.append(thumb)
    contact=Image.new('RGB',(1280,1080),NAVY)
    for i,im in enumerate(thumbs): contact.paste(im,((i%2)*640,(i//2)*360))
    contact.save(OUT/'storyboard-animated.jpg',quality=94)
    frame(26).save(OUT/'poster-animated.jpg',quality=95)
    wav=soundtrack()
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    destination=OUT/'wfh-pulse-promo-animated.mp4'
    cmd=[ffmpeg,'-y','-f','rawvideo','-vcodec','rawvideo','-s',f'{W}x{H}','-pix_fmt','rgb24','-r',str(FPS),'-i','-','-i',str(wav),'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',str(destination)]
    with (OUT/'render.log').open('w') as log:
        proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=log,stderr=log)
        try:
            for i in range(DURATION*FPS):
                proc.stdin.write(frame(i/FPS).tobytes())
                if i%(FPS*3)==0: print(f'Rendered {i//FPS}/{DURATION} seconds',flush=True)
        finally:
            proc.stdin.close()
        if proc.wait()!=0: raise RuntimeError('Video encoding failed; see render.log')
    print(f'Created {destination} ({destination.stat().st_size:,} bytes)',flush=True)

if __name__=='__main__': main()
