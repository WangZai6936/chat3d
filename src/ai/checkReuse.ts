/** Run-local bounded reuse. Keys include all mutable inputs; failed calls are never stored. */
export class CheckReuse {
 private revision=-1;
 private keys=new Set<string>();
 seen(revision:number,key:string):boolean{if(this.revision!==revision){this.revision=revision;this.keys.clear();}return this.keys.has(key);}
 remember(revision:number,key:string){this.seen(revision,key);this.keys.add(key);if(this.keys.size>64)this.keys.delete(this.keys.values().next().value!);}
}
