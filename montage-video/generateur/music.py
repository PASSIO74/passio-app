import math, array, wave, random
SR=44100; DUR=48.7; N=int(SR*DUR)
L=array.array('f',[0.0])*N
random.seed(7)
def f(m): return 440*2**((m-69)/12)
BEAT=60/96
# progression (midi) every 2 bars = 8 beats
CH=[[48,55,59,62,64],[45,52,55,60,64],[41,48,52,57,60],[43,50,55,59,62]]
seg=8*BEAT
def env_pad(t,t0,t1):
    a=min(1,(t-t0)/0.9); r=min(1,(t1-t)/0.9); return max(0,min(a,r))
# pad
t=0.0;k=0
while t<DUR:
    notes=CH[k%4]; t0=t-0.4; t1=t+seg+0.5
    for m in notes:
        for det in (-0.07,0.0,0.06):
            fr=f(m+12)*2**(det/12); ph=random.random()*6.28
            s0=max(0,int(t0*SR)); s1=min(N,int(t1*SR))
            w=2*math.pi*fr/SR
            for i in range(s0,s1):
                tt=i/SR; e=env_pad(tt,t0,t1)
                L[i]+=0.018*e*(math.sin(w*i+ph)+0.25*math.sin(2*w*i+ph))
    t+=seg;k+=1
# plucks (8th notes) from 5.6 to 44.7
def pluck(t0,fr,amp):
    s0=int(t0*SR); n=int(0.9*SR); w=2*math.pi*fr/SR
    for j in range(n):
        i=s0+j
        if i>=N: break
        e=math.exp(-j/SR*5.5)*min(1,j/60)
        L[i]+=amp*e*(math.sin(w*j)+0.35*math.sin(2*w*j)*math.exp(-j/SR*9))
pat=[0,2,4,3,1,4,2,3]
t=5.6-0.001; step=BEAT/2; n=0
while t<44.7:
    k=int(t/seg)%4; ns=sorted(CH[k])
    m=ns[pat[n%8]%len(ns)]+24
    amp=0.07 if t<40.7 else 0.09
    pluck(t,f(m),amp*(1.0 if n%2==0 else 0.7)); t+=step; n+=1
# kick + shaker
def kick(t0,amp):
    s0=int(t0*SR)
    ph=0.0
    for j in range(int(0.35*SR)):
        i=s0+j
        if i>=N: break
        tt=j/SR; fr=48+90*math.exp(-tt*28); ph+=2*math.pi*fr/SR
        L[i]+=amp*math.exp(-tt*9)*math.sin(ph)
def shaker(t0,amp):
    s0=int(t0*SR); prev=0
    for j in range(int(0.08*SR)):
        i=s0+j
        if i>=N: break
        x=random.uniform(-1,1); hp=x-prev; prev=x
        L[i]+=amp*math.exp(-j/SR*55)*hp
t=5.6
while t<44.7:
    b=round((t-5.6)/BEAT)
    kick(t,0.32 if t>=40.7 else 0.24)
    shaker(t+BEAT/2,0.045); t+=BEAT
# riser into logo 2.2-3.4
for i in range(int(2.0*SR),int(3.4*SR)):
    tt=i/SR; x=(tt-2.0)/1.4
    L[i]+=0.05*x*x*random.uniform(-1,1)
# master fade
for i in range(N):
    tt=i/SR; g=min(1,tt/1.2)*min(1,(DUR-tt)/2.5)
    L[i]=max(-1,min(1,L[i]*g))
w=wave.open("music.wav","wb");w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR)
w.writeframes(array.array('h',[int(x*30000) for x in L]).tobytes());w.close()
print("ok")
