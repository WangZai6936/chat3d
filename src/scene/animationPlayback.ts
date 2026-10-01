export interface PlaybackState {playing:boolean;time:number;speed:number;duration:number;loop:boolean;error:string}
export class AnimationClock {
 state:PlaybackState={playing:false,time:0,speed:1,duration:0,loop:false,error:''};
 configure(duration=0,loop=false){this.state={...this.state,playing:false,time:0,duration,loop,error:''};}
 play(){if(this.state.duration>0){if(this.state.time>=this.state.duration)this.state.time=0;this.state.playing=true;this.state.error='';}}
 pause(){this.state.playing=false;}
 reset(){this.state.playing=false;this.state.time=0;this.state.error='';}
 seek(time:number){if(!Number.isFinite(time))return;this.state.time=Math.max(0,Math.min(this.state.duration,time));}
 setSpeed(speed:number){if(Number.isFinite(speed)&&speed>=.25&&speed<=4)this.state.speed=speed;}
 tick(delta:number){if(!this.state.playing||!Number.isFinite(delta)||delta<0)return false;this.state.time+=Math.min(delta,.25)*this.state.speed;if(this.state.time>=this.state.duration){if(this.state.loop)this.state.time%=this.state.duration;else{this.state.time=this.state.duration;this.pause();}}return true;}
 fail(message:string){this.state.playing=false;this.state.error=message;}
}
