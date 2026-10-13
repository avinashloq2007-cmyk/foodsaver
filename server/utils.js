import { randomUUID } from 'node:crypto';
export const id=()=>randomUUID();
export class AppError extends Error {constructor(status,message){super(message);this.status=status;}}
export const assert=(condition,status,message)=>{if(!condition)throw new AppError(status,message);};
export function text(value,name,min=1,max=120){assert(typeof value==='string' && value.trim().length>=min && value.trim().length<=max,400,`${name} must be ${min}–${max} characters.`); return value.trim();}
export function coords(latitude,longitude){const lat=Number(latitude),lng=Number(longitude); assert(latitude!==null && longitude!==null && latitude!=='' && longitude!=='' && Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180,400,'Choose a valid pickup location.');return {latitude:lat,longitude:lng};}
export function distance(a,b){const rad=x=>x*Math.PI/180; const dlat=rad(b.latitude-a.latitude),dlng=rad(b.longitude-a.longitude); const h=Math.sin(dlat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlng/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
export function publicFood(food,user,accepted=false){const own=food.donor_id===user?.user_id; const out={...food};delete out.phone_number; delete out.email;
  if(!own&&!accepted){delete out.pickup_address;out.latitude=Math.round(out.latitude*100)/100;out.longitude=Math.round(out.longitude*100)/100;}
  return out;
}
export function csv(rows){if(!rows.length)return 'No records\r\n';const keys=Object.keys(rows[0]);const escape=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return [keys,...rows.map(row=>keys.map(k=>row[k]))].map(row=>row.map(escape).join(',')).join('\r\n');}
