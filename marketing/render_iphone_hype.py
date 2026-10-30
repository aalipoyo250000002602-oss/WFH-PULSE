"""Portrait promo: exact iPhone simulator captures, motion design, original 150 BPM audio."""
from pathlib import Path
import math, sys, subprocess, wave, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0,'/tmp/wfh-pulse-video-deps')
import imageio_ffmpeg
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'marketing/iphone-hype'
OUT.mkdir(parents=True,exist_ok=True)
W,H,FPS,DURATION=1080,1920,30,24
BLUE='#4D82FF'; RED='#FF5D56'; WHITE='#F6F8FF'; MUTED='#9DAFCC'
FONTS={}
def font(n,bold=True):
    k=(n,bold)
    if k not in FONTS: FONTS[k]=ImageFont.truetype('/System/Library/Fonts/Supplemental/'+('Arial Bold.ttf' if bold else 'Arial.ttf'),n)
    return FONTS[k]
def txt(d,xy,s,n=44,c=WHITE,bold=True): d.text(xy,s,font=font(n,bold),fill=c)
def center(d,y,s,n=44,c=WHITE):
    length=d.textlength(s,font=font(n)); txt(d,((W-length)/2,y),s,n,c)
def ease(v): return 1-(1-max(0,min(1,v)))**3
def smooth(v): return (1-math.cos(max(0,min(1,v))*math.pi))/2
screens={}
for name,source in [('requests','/tmp/wfh-pulse-iphone-pro-max.png'),('login','/tmp/wfh-pulse-iphone-opening.png')]:
    target=OUT/(name+'-iphone.png')
    if not target.exists(): shutil.copy2(source,target)
    screens[name]=Image.open(target).convert('RGB')
# Cache full phone renders so animation moves the actual screenshot as one object.
phones={}
def phone(name,width):
    width=int(width)//4*4
    key=(name,width)
    if key in phones: return phones[key].copy()
    screen=screens[name]; sw=width-28; sh=round(sw*screen.height/screen.width)
    ph=sh+28
    im=Image.new('RGBA',(width+28,ph+24),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.rounded_rectangle((11,8,width+11,ph+8),radius=width*.115,fill='#707783',outline='#C2C9D5',width=2)
    d.rounded_rectangle((15,12,width+7,ph+4),radius=width*.105,fill='#05070D')
    shot=screen.resize((sw,sh),Image.Resampling.LANCZOS)
    mask=Image.new('L',(sw,sh)); md=ImageDraw.Draw(mask); md.rounded_rectangle((0,0,sw,sh),radius=width*.085,fill=255)
    im.paste(shot,(25,22),mask)
    # Hardware island, positioned in the screenshot's existing empty status-bar area.
    cx=25+sw/2; top=22+sh*.013
    d.rounded_rectangle((cx-sw*.13,top,cx+sw*.13,top+sw*.068),radius=sw*.04,fill='#050505')
    d.ellipse((cx+sw*.075,top+sw*.02,cx+sw*.10,top+sw*.045),fill='#111728')
    d.rounded_rectangle((width+10,ph*.26,width+15,ph*.36),radius=3,fill='#737D8D')
    d.rounded_rectangle((5,ph*.19,11,ph*.245),radius=3,fill='#737D8D')
    d.rounded_rectangle((5,ph*.265,11,ph*.32),radius=3,fill='#737D8D')
    phones[key]=im
    return im.copy()
yy,xx=np.mgrid[0:H,0:W]
glow=np.exp(-(((xx-860)/650)**2+((yy-950)/1100)**2))
BG=np.zeros((H,W,3),dtype=np.uint8)
for c,(a,b) in enumerate([(5,11),(10,22),(24,44)]): BG[:,:,c]=a+glow*b
BG=Image.fromarray(BG)
def putphone(im,name,cx,top,width=570,angle=0,opacity=1):
    p=phone(name,width)
    if angle: p=p.rotate(angle,Image.Resampling.BICUBIC,expand=True)
    if opacity<1: p.putalpha(p.getchannel('A').point(lambda a:int(a*opacity)))
    im.paste(p,(int(cx-p.width/2),int(top)),p)
def beatbars(d,t):
    for i in range(58):
        bh=5+27*abs(math.sin(i*.67+t*9))*max(.25,(1-(t*2.5)%1))
        x=77+i*16; d.rounded_rectangle((x,1818-bh,x+5,1818+bh),radius=2,fill=BLUE if i%4 else RED)
def title(d,kicker,lines,u):
    y=160+int((1-ease(u/.55))*40)
    center(d,100,kicker,23,RED)
    for j,line in enumerate(lines): center(d,y+j*80,line,74)
def frame(t):
    im=BG.copy();d=ImageDraw.Draw(im)
    # Moving orbit lines and particles provide depth behind the iPhone.
    for i in range(4):
        r=340+i*117+12*math.sin(t*.6+i)
        d.ellipse((540-r,1000-r,540+r,1000+r),outline='#1A2B4B',width=2)
    for i in range(28):
        x=(i*173+t*(8+i%5))%1080;y=(i*283+t*11)%1920
        d.ellipse((x,y,x+3,y+3),fill='#3D527D')
    txt(d,(64,40),'WFH PULSE',23)
    txt(d,(788,40),'iPHONE EDITION',18,MUTED)
    scene=min(5,int(t/4));u=t-scene*4
    bounce=5*math.sin(t*2.5*2*math.pi)*math.exp(-((t*.5)%1)*5)
    if scene==0:
        title(d,'REMOTE TEAMS. REAL MOMENTUM.',['WORK ANYWHERE.','MOVE TOGETHER.'],u)
        putphone(im,'login',540+360*(1-ease(u/.9)),412+80*(1-ease(u/.9))+bounce,562,angle=-5*(1-ease(u/1.4)))
        center(ImageDraw.Draw(im),1718,'The real app. On iPhone.',28,MUTED)
    elif scene==1:
        title(d,'YOUR TEAM. ONE PULSE.',['EVERY REQUEST.','IN VIEW.'],u)
        putphone(im,'requests',540,412+100*(1-ease(u/.7))+bounce,562,angle=2*math.sin(u*.8))
        center(ImageDraw.Draw(im),1718,'Leave. Overtime. Adjustments.',28,MUTED)
    elif scene==2:
        title(d,'LESS BACK-AND-FORTH.',['STAY ON TOP','OF THE DAY.'],u)
        # A real-pixel close-up, retaining the exact captured application content.
        putphone(im,'requests',540,100-30*smooth(u/4),940,angle=-1.2)
        d=ImageDraw.Draw(im)
        d.rectangle((0,0,W,360),fill='#071125')
        title(d,'A CLOSER LOOK AT WFH PULSE',['YOUR WORKSPACE.','IN YOUR POCKET.'],u)
        d.rectangle((0,1660,W,H),fill='#071125')
        center(d,1705,'One place to keep requests in view.',28,MUTED)
    elif scene==3:
        title(d,'PULSE AI SMART LEAVE PLANNER',['PLAN SMARTER.','REST BETTER.'],u)
        putphone(im,'requests',805,605,420,angle=-7)
        d=ImageDraw.Draw(im)
        labels=[('01','Find leave schedules'),('02','Use weekends + holidays'),('03','Explore AI event context')]
        for i,(num,label) in enumerate(labels):
            a=ease((u-i*.32)/.65);x=70-int(180*(1-a));y=530+i*185
            d.rounded_rectangle((x,y,x+580,y+142),radius=24,fill='#132442',outline='#2C4772',width=2)
            txt(d,(x+24,y+18),num,23,RED)
            txt(d,(x+24,y+63),label,32)
        txt(d,(75,1170),'MORE TIME',59)
        txt(d,(75,1245),'FOR LIFE.',59,RED)
        txt(d,(75,1385),'AI context when connected.',25,MUTED,False)
        txt(d,(75,1430),'Built-in guidance as fallback.',25,MUTED,False)
        center(d,1718,'AI feature highlight • captured Requests screen',22,MUTED)
    elif scene==4:
        title(d,'REAL SCREENS. REAL WFH PULSE.',['BUILT FOR','YOUR RHYTHM.'],u)
        # Two actual captures move through a product carousel on successive beats.
        a=smooth((u-1.6)/.75)
        putphone(im,'login',540-1100*a,425+bounce,550,angle=4*(1-a))
        putphone(im,'requests',1640-1100*a,425+bounce,550,angle=-4*(1-a))
        center(ImageDraw.Draw(im),1718,'From sign-in to team requests.',28,MUTED)
    else:
        title(d,'EMPOWERING REMOTE TEAMS',['WFH PULSE.','FEEL THE FLOW.'],u)
        putphone(im,'requests',540,402+bounce,540,angle=0)
        d=ImageDraw.Draw(im)
        center(d,1655,'Attendance. Requests. Pulse AI.',29)
        center(d,1710,'WORK ANYWHERE. MOVE TOGETHER.',23,RED)
    d=ImageDraw.Draw(im);beatbars(d,t)
    d.line((64,1870,1016,1870),fill='#273959',width=3)
    d.line((64,1870,64+952*t/DURATION,1870),fill=RED,width=3)
    txt(d,(64,1887),'ACTUAL iPHONE SIMULATOR CAPTURES',16,MUTED)
    txt(d,(841,1887),f'{scene+1:02d} / 06',16,MUTED)
    # Wipes are locked to the downbeats at each four-second scene boundary.
    for cut in (4,8,12,16,20):
        age=t-cut
        if -.14<age<.20:
            x=int(-1000+(age+.14)/.34*3100)
            d.polygon([(x,0),(x+700,0),(x+200,H),(x-500,H)],fill=BLUE)
            d.polygon([(x+740,0),(x+780,0),(x+280,H),(x+240,H)],fill=RED)
    if t<.25: im=Image.blend(Image.new('RGB',(W,H),'#050A18'),im,ease(t/.25))
    if t>23.65: im=Image.blend(im,Image.new('RGB',(W,H),'#050A18'),smooth((t-23.65)/.35))
    return im

def soundtrack():
    sr=44100;n=sr*DURATION;beat=.4;rng=np.random.default_rng(341)
    drums=np.zeros((n,2));music=np.zeros((n,2))
    def ts(seconds): return np.arange(int(sr*seconds))/sr
    def add(track,start,sig,pan=0):
        a=round(start*sr)
        if a<0 or a>=n:return
        count=min(len(sig),n-a);track[a:a+count,0]+=sig[:count]*math.sqrt((1-pan)/2);track[a:a+count,1]+=sig[:count]*math.sqrt((1+pan)/2)
    def hz(m): return 440*2**((m-69)/12)
    # Original syncopated 808/bass composition at 150 BPM, with a four-second build.
    roots=[33,33,29,36,31,33]
    for b in range(60):
        start=b*beat;section=int(start/4);energy=.58 if section==0 else 1
        if b%4 in (0,2) or (section>0 and b%10 in (7,9)):
            tt=ts(.36);kick=np.sin(2*np.pi*(48*tt+6*(1-np.exp(-tt*42))))*np.exp(-tt*14)
            add(drums,start,kick*.95*energy)
        if b%4==2:
            tt=ts(.18);noise=rng.normal(size=len(tt));env=np.exp(-tt*34)
            add(drums,start,(noise-np.roll(noise,1)*.6)*env*.22*energy)
            add(drums,start+.012,np.sin(2*np.pi*185*tt)*np.exp(-tt*29)*.15)
        for sub in range(4 if section else 2):
            tt=ts(.07);noise=rng.normal(size=len(tt));h=np.diff(noise,prepend=0)*np.exp(-tt*85)
            add(drums,start+sub*beat/(4 if section else 2),h*(.035 if sub%2 else .06),(-1)**sub*.65)
        if b%10==9:
            for j in range(6):
                tt=ts(.045);add(drums,start+j*beat/6,rng.normal(size=len(tt))*np.exp(-tt*130)*.07,(j-2.5)/4)
        if b%2==0:
            tt=ts(.55);f=hz(roots[section]);phase=2*np.pi*f*tt+1.5*(1-np.exp(-tt*15))
            bass=np.tanh((np.sin(phase)+.2*np.sin(phase*2))*2.1)*np.exp(-tt*4)*np.minimum(tt/.007,1)
            add(music,start,bass*.33*energy)
        if section>0:
            notes=[81,84,88,84,79,81,76,79];m=notes[b%8]+(0 if section%2 else -12)
            tt=ts(.28);f=hz(m);lead=np.sin(2*np.pi*f*tt)+.26*np.sin(2*np.pi*2*f*tt)
            env=np.minimum(tt/.004,1)*np.exp(-tt*15)
            add(music,start,lead*env*.12,math.sin(b)*.5)
            add(music,start+.3,lead*env*.035,-math.sin(b)*.5)
    for cut in [4,8,12,16,20]:
        tt=ts(.55);noise=rng.normal(size=len(tt));sweep=(noise+np.roll(noise,1)+np.roll(noise,2))/3
        add(drums,cut-.55,sweep*(tt/.55)**2*.24,-.4)
        tt=ts(.7);add(drums,cut,np.sin(2*np.pi*43*tt)*np.exp(-tt*6)*.6)
    t=np.arange(n)/sr;duck=.32+.68*np.minimum((t%beat)/.13,1)
    mix=drums+music*duck[:,None];mix*=np.minimum(t/.06,1)[:,None]*np.minimum((DURATION-t)/.35,1)[:,None]
    mix=np.tanh(mix*1.65);mix*=.95/max(.95,float(np.max(np.abs(mix))))
    p=OUT/'original-hype-beat-150bpm.wav'
    with wave.open(str(p),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((mix*32767).astype('<i2').tobytes())
    return p

def preview():
    contact=Image.new('RGB',(1080,1280),'#050A18')
    for i,t in enumerate([2,6,10,14,18.8,22]):
        im=frame(t);im.thumbnail((360,640));contact.paste(im,((i%3)*360,(i//3)*640))
    contact.save(OUT/'storyboard.jpg',quality=94)
    frame(6).save(OUT/'poster.jpg',quality=95)

def main():
    preview()
    if '--preview' in sys.argv: return
    wav=soundtrack();dest=OUT/'wfh-pulse-iphone-hype.mp4'
    args=[imageio_ffmpeg.get_ffmpeg_exe(),'-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',str(wav),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','256k','-movflags','+faststart','-shortest',str(dest)]
    with (OUT/'render.log').open('w') as log:
        proc=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=log,stderr=log)
        try:
            for i in range(DURATION*FPS):
                proc.stdin.write(frame(i/FPS).tobytes())
                if i%(FPS*4)==0: print(f'Rendered {i//FPS}/{DURATION}s',flush=True)
        finally: proc.stdin.close()
        if proc.wait(): raise RuntimeError('Encoding failed')
    print(f'Created {dest} ({dest.stat().st_size:,} bytes)',flush=True)
if __name__=='__main__':main()
