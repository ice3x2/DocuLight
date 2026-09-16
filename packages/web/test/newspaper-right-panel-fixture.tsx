import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { AppShell, type ShellPanelState } from '../src/shell/AppShell.js';
import type { WorkspaceTreeView } from '../src/tree/tree-contract.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

const long='아주긴한글과공백없는링크이름ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const nested={id:'nested',name:'같은이름.md',kind:'file' as const,visibility:'full' as const,level:'edit' as const,parentLevel:'edit' as const,children:[]};
const workspaces:WorkspaceTreeView[]=[{workspace:{id:'ws',name:`신문 편집국 ${long}`},visibility:'full',roots:[{id:'active',name:'현재.md',kind:'file',visibility:'full',level:'edit',parentLevel:'edit',children:[]},{id:'root-same',name:'같은이름.md',kind:'file',visibility:'full',level:'edit',parentLevel:'edit',children:[]},{id:'dir',name:'폴더',kind:'directory',visibility:'full',level:'edit',parentLevel:'edit',children:[nested]}]}];
const resolved=Array.from({length:24},(_,i)=>({nodeId:i===0?'nested':`root-same`,name:i===0?'같은이름.md':`${long}-${i}`,workspaceName:workspaces[0]!.workspace.name,resolved:true}));
const initialState=new URLSearchParams(location.search).get('state')??'ready';
function Fixture(){const [query,setQuery]=useState('');const [state,setState]=useState(initialState);const panel:ShellPanelState=state==='loading'?{state:'loading'}:state==='error'?{state:'error',message:'잠시 후 다시 시도하십시오.',onRetry:()=>{document.body.dataset.retried='true';setState('ready');}}:{state:'ready'};return <AppShell viewer={{superuser:false,workspaceCount:1,adminWorkspaceCount:0}} workspaces={workspaces} documents={{tabs:[{nodeId:'active',name:'현재.md',breadcrumb:['현재.md'],save:'saved',level:'edit'}],activeId:state==='none'?null:'active'}} links={{backlinks:state==='empty'?[]:resolved,outgoing:[...resolved,{nodeId:null,name:'같은이름.md',workspaceName:null,resolved:false}]}} linksState={panel} tags={{basis:'내가 볼 수 있는 문서 기준 출현 문서 수',tags:state==='empty'?[]:Array.from({length:24},(_,i)=>({name:`${long}-${i}`,documents:123456+i}))}} tagsState={panel} tagScope="ws" onTagScope={()=>{}} query={query} onQuery={setQuery} onOpen={(node)=>{document.body.dataset.opened=node.id;}}/>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
