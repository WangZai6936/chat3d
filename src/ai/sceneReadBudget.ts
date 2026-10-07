/** Keep every identifier and transform; heavy shape descriptions are fetched explicitly by node ID. */
export function boundSceneRead<T extends {nodes:{id:string;desc?:string}[]}>(context:T,geometryTypes:Map<string,string>,limit=24000){
 if(JSON.stringify(context).length<=limit)return context;
 return {...context,detailOmitted:true,nodes:context.nodes.map(n=>({...n,desc:geometryTypes.get(n.id)??'group'})),next:'所有部件ID、名称与变换仍保留。长几何参数未展开；需要具体尺寸或造型参数时，用read_scene({nodeIds:[目标ID]})只读相关零件，不要猜测形状。'};
}
