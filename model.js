/* Demo domain model. Quantities are integer tenths; money is integer MYR cents.
   This browser model is not an authentication or production settlement boundary. */
(function(root){
'use strict';
const active=r=>['Submitted','Approved'].includes(r.status);
const ensure=(v,m)=>{if(!v)throw new Error(m)};
const clean=(v,max=500)=>String(v??'').trim().slice(0,max);
function seed(){return {version:2,seq:10,projects:[
 {id:'forest',name:'Borneo Forest Conservation',type:'Forest conservation',location:'Sabah, Malaysia',price:4800,vintage:'2024',method:'Avoided deforestation',description:'An illustrative forest project focused on protecting existing habitat and supporting local stewardship.',inventory:2500,status:'Published',registry:'DEMO-FOR-001',documents:[]},
 {id:'methane',name:'Peninsula Biogas Recovery',type:'Methane avoidance',location:'Perak, Malaysia',price:3600,vintage:'2025',method:'Methane capture',description:'An illustrative biogas project capturing methane from organic waste for productive energy use.',inventory:4000,status:'Published',registry:'DEMO-BIO-002',documents:[]},
 {id:'biochar',name:'Circular Biomass Initiative',type:'Biochar removal',location:'Johor, Malaysia',price:12000,vintage:'2025',method:'Biochar carbon storage',description:'An illustrative project converting agricultural residues into biochar for longer-term carbon storage.',inventory:1500,status:'Published',registry:'DEMO-REM-003',documents:[]}
 ],accounts:[
 {id:'sme1',name:'Meranti Manufacturing',registration:'DEMO-SSM-001',contact:'Aina Tan',email:'aina@example.com',status:'Verified',sector:'Manufacturing',documents:[],note:'Seeded verified demo company.'},
 {id:'sme2',name:'Kita Foods',registration:'DEMO-SSM-002',contact:'Daniel Lim',email:'daniel@example.com',status:'Verified',sector:'Food & beverage',documents:[],note:'Seeded verified demo company.'},
 {id:'sme3',name:'Rimba Packaging',registration:'DEMO-SSM-003',contact:'Mei Lee',email:'mei@example.com',status:'Pending',sector:'Packaging',documents:[],note:'Awaiting demo business review.'}
 ],balances:{sme1:{forest:125,methane:80},sme2:{forest:50},sme3:{}},requests:[],retirements:[],audit:[],ledger:[
 {id:'OPEN-1',type:'Opening allocation',accountId:'sme1',projectId:'forest',units:125,amount:0,date:'2026-10-05T00:00:00.000Z',reference:'Demo starting balance'},
 {id:'OPEN-2',type:'Opening allocation',accountId:'sme1',projectId:'methane',units:80,amount:0,date:'2026-10-05T00:00:00.000Z',reference:'Demo starting balance'},
 {id:'OPEN-3',type:'Opening allocation',accountId:'sme2',projectId:'forest',units:50,amount:0,date:'2026-10-05T00:00:00.000Z',reference:'Demo starting balance'}]};}
class Store{
 constructor(data){this.data=data||seed();}
 project(id){const p=this.data.projects.find(p=>p.id===id);ensure(p,'Project not found.');return p;}
 account(id){const a=this.data.accounts.find(a=>a.id===id);ensure(a,'Company not found.');return a;}
 verified(id){ensure(this.account(id).status==='Verified','This company must be verified before transacting.');}
 admin(actor){ensure(actor==='admin','Admin action required.');}
 next(prefix){return prefix+'-'+String(++this.data.seq).padStart(4,'0');}
 log(actor,action,detail){this.data.audit.unshift({id:this.next('AUD'),actor,action,detail,date:new Date().toISOString()});}
 balance(a,p){return this.data.balances[a]?.[p]||0;}
 reserved(a,p){return this.data.requests.filter(r=>r.accountId===a&&r.projectId===p&&r.type!=='Buy'&&active(r)).reduce((s,r)=>s+r.units,0);}
 available(a,p){return this.balance(a,p)-this.reserved(a,p);}
 inventory(p){return this.project(p).inventory-this.data.requests.filter(r=>r.projectId===p&&r.type==='Buy'&&active(r)).reduce((s,r)=>s+r.units,0);}
 quote(p,units,price){const subtotal=Math.round((price??this.project(p).price)*units/10);const fee=Math.round(subtotal*.015);return {subtotal,fee,total:subtotal+fee,net:subtotal-fee};}
 submit(actor,input){
  const a=this.account(actor);this.verified(actor);const p=this.project(input.projectId);const type=input.type;
  ensure(['Buy','Sell','Transfer','Retire'].includes(type),'Unknown request type.');
  const units=Number(input.units);ensure(Number.isSafeInteger(units)&&units>0&&units<=1000000,'Use quantities from 0.1 to 100,000 in increments of 0.1.');
  if(type==='Buy'){ensure(p.status==='Published','Project is not available for purchase.');ensure(this.inventory(p.id)>=units,'Not enough unreserved project inventory.');}
  else ensure(this.available(actor,p.id)>=units,'Not enough available credits. Pending requests reserve credits.');
  const price=type==='Sell'?Number(input.price):p.price;
  if(type==='Sell')ensure(Number.isSafeInteger(price)&&price>0&&price<=100000000,'Enter a valid asking price.');
  if(type==='Transfer'){this.verified(input.recipientId);ensure(input.recipientId!==actor,'Choose a different recipient company.');}
  if(type==='Retire')ensure(clean(input.purpose).length>=5,'Explain the purpose of retirement (at least 5 characters).');
  const r={id:this.next('REQ'),accountId:actor,projectId:p.id,type,units,price,recipientId:type==='Transfer'?input.recipientId:null,purpose:clean(input.purpose),status:'Submitted',date:new Date().toISOString(),reviewNote:'',reference:'',quote:this.quote(p.id,units,price)};
  this.data.requests.unshift(r);this.log(actor,type+' request submitted',r.id+' · '+a.name);return r;
 }
 request(id){const r=this.data.requests.find(r=>r.id===id);ensure(r,'Request not found.');return r;}
 cancel(actor,id){const r=this.request(id);ensure(r.accountId===actor,'You can cancel only your own requests.');ensure(r.status==='Submitted','Only submitted requests can be cancelled.');r.status='Cancelled';this.log(actor,'Request cancelled',id);}
 review(actor,id,decision,note){this.admin(actor);const r=this.request(id);ensure(active(r),'This request is already closed.');ensure(['Approve','Reject'].includes(decision),'Invalid decision.');ensure(clean(note).length>=3,'Add a review note.');if(decision==='Approve'){ensure(r.status==='Submitted','Request is already approved.');this.verified(r.accountId);if(r.type==='Transfer')this.verified(r.recipientId);r.status='Approved';}else r.status='Rejected';r.reviewNote=clean(note);this.log(actor,'Request '+r.status.toLowerCase(),id+' · '+r.reviewNote);}
 settle(actor,id,input){
  this.admin(actor);const r=this.request(id);ensure(r.status==='Approved','Approve this request before completing it.');this.verified(r.accountId);
  const p=this.project(r.projectId);const reference=clean(input.reference,100);ensure(reference.length>=4,'Enter a demo execution or registry reference.');
  ensure(!this.data.requests.some(x=>x.id!==id&&x.status==='Completed'&&x.reference===reference),'That execution reference has already been used.');
  let recipient=r.recipientId;
  if(r.type==='Sell'){recipient=input.buyerId;ensure(recipient&&recipient!==r.accountId,'Select a different verified buying company.');this.verified(recipient);}
  if(r.type==='Transfer')this.verified(recipient);
  if(r.type==='Buy')ensure(p.inventory>=r.units,'Insufficient source inventory.');
  else ensure(this.balance(r.accountId,p.id)>=r.units,'Insufficient holdings.');
  if(r.type==='Retire')ensure(input.confirmRetirement===true,'Confirm the simulated retirement is irreversible.');
  const date=new Date().toISOString();
  const change=(a,n,type,amount)=>{this.data.balances[a]??={};this.data.balances[a][p.id]=this.balance(a,p.id)+n;this.data.ledger.unshift({id:this.next('TXN'),requestId:id,accountId:a,projectId:p.id,units:n,type,amount,date,reference});};
  if(r.type==='Buy'){p.inventory-=r.units;change(r.accountId,r.units,'Buy',-r.quote.total);}
  if(r.type==='Sell'){change(r.accountId,-r.units,'Sell',r.quote.net);change(recipient,r.units,'Buy from SME',-r.quote.subtotal);}
  if(r.type==='Transfer'){change(r.accountId,-r.units,'Transfer out',0);change(recipient,r.units,'Transfer in',0);}
  if(r.type==='Retire'){change(r.accountId,-r.units,'Retire',0);this.data.retirements.unshift({id:this.next('CERT'),requestId:id,accountId:r.accountId,projectId:p.id,units:r.units,beneficiary:this.account(r.accountId).name,purpose:r.purpose,date,reference});}
  r.status='Completed';r.reference=reference;r.completedAt=date;r.recipientId=recipient||null;this.log(actor,'Demo '+r.type.toLowerCase()+' completed',id+' · '+reference);return r;
 }
 addAccount(actor,input){ensure(actor==='admin'||actor==='onboarding','Account creation not allowed.');const email=clean(input.email,120);ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Enter a valid email.');const registration=clean(input.registration,60);ensure(registration.length>=3,'Enter a company registration reference.');ensure(!this.data.accounts.some(a=>a.registration.toLowerCase()===registration.toLowerCase()),'Registration reference already exists.');ensure(clean(input.name).length>=3&&clean(input.contact).length>=2,'Enter company and contact names.');const a={id:this.next('SME'),name:clean(input.name,100),registration,email,contact:clean(input.contact,100),sector:clean(input.sector,80),status:'Pending',documents:[],note:'Awaiting review.'};this.data.accounts.push(a);this.data.balances[a.id]={};this.log(actor,'Company submitted for verification',a.name);return a;}
 verify(actor,id,status,note){this.admin(actor);ensure(['Verified','Pending','Suspended','Rejected'].includes(status),'Invalid company status.');ensure(clean(note).length>=3,'Add a verification decision note.');const a=this.account(id);a.status=status;a.note=clean(note);this.log(actor,'Company '+status.toLowerCase(),a.name+' · '+a.note);}
 saveProject(actor,input,id){this.admin(actor);ensure(clean(input.name).length>=3,'Project name is required.');ensure(['Draft','Published','Paused'].includes(input.status),'Invalid listing status.');ensure(Number.isSafeInteger(input.price)&&input.price>0&&input.price<=100000000,'Enter a valid price.');ensure(Number.isSafeInteger(input.inventory)&&input.inventory>=0&&input.inventory<=10000000,'Enter a valid inventory quantity.');ensure(/^\d{4}$/.test(input.vintage),'Vintage must be a four-digit year.');ensure(clean(input.description).length>=10,'Add a project description.');const existing=id?this.project(id):null;if(existing){const reserved=existing.inventory-this.inventory(id);ensure(input.inventory>=reserved,'Inventory cannot be lower than pending buy reservations.');}const fields={name:clean(input.name,100),location:clean(input.location,100),type:clean(input.type,60),method:clean(input.method,100),description:clean(input.description,1500),registry:clean(input.registry,100),vintage:input.vintage,status:input.status,price:input.price,inventory:input.inventory};let p;if(existing){Object.assign(existing,fields);p=existing;}else{p={...fields,id:this.next('PRJ'),documents:[]};this.data.projects.push(p);}this.log(actor,'Project '+(id?'updated':'created'),p.name);return p;}
 attach(actor,kind,id,doc){if(kind==='project')this.admin(actor);else ensure(actor==='admin'||actor===id,'Cannot upload for another company.');ensure(['project','account'].includes(kind),'Invalid document destination.');ensure(doc.name&&['application/pdf','image/png','image/jpeg','text/plain'].includes(doc.mime),'Use PDF, PNG, JPG or TXT.');ensure(doc.size<=500000&&doc.size>0,'Files must be under 500 KB.');ensure(/^data:(application\/pdf|image\/(png|jpeg)|text\/plain);base64,/.test(doc.data),'Invalid file format.');const item=kind==='project'?this.project(id):this.account(id);ensure(item.documents.length<5,'Maximum five documents per item.');item.documents.push({...doc,id:this.next('DOC')});this.log(actor,'Demo document attached',item.name+' · '+doc.name);}
}
root.CanopyModel={Store,seed,active};if(typeof module!=='undefined')module.exports=root.CanopyModel;
})(typeof window!=='undefined'?window:globalThis);
