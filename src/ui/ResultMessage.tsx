import {MessageText} from './MessageText';

// Keep stored/model text intact; only collapse verbose result presentation.
export function ResultMessage({text}:{text:string}){
 const marker=text.search(/\n(?:仍需改进|已知问题|细节验收未完成)[：:]/);
 const verbose=text.length>480||text.split('\n').length>8;
 if(marker<0&&!verbose)return <MessageText text={text}/>;
 const first=marker>=0?text.slice(0,marker):text.split('\n')[0];
 const lead=first.length>240?first.slice(0,240)+'…':first;
 return <div className="result-message"><MessageText text={lead}/><details><summary>查看完整结果与待核对项</summary><div className="result-message-details"><MessageText text={text}/></div></details></div>;
}
