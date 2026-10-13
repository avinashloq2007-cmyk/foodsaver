import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { mkdir, writeFile } from 'node:fs/promises';
import { config } from './config.js';
import { assert, id } from './utils.js';
export const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:20},fileFilter:(req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))});
export async function storeImage(file){
  if(!file)return null;
  const bytes=file.buffer;
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  const ext=png?'png':jpg?'jpg':webp?'webp':null;
  assert(ext,400,'Upload a valid JPEG, PNG or WebP image (maximum 5 MB).');
  assert((ext==='jpg'?'image/jpeg':`image/${ext}`)===file.mimetype,400,'Image content does not match its file type.');
  if(config.demo){await mkdir('uploads',{recursive:true});const name=`${id()}.${ext}`;await writeFile(`uploads/${name}`,bytes);return `/uploads/${name}`;}
  assert(process.env.CLOUDINARY_CLOUD_NAME&&process.env.CLOUDINARY_API_KEY&&process.env.CLOUDINARY_API_SECRET,503,'Image storage is not configured.');
  cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET,secure:true});
  const result=await new Promise((resolve,reject)=>{const stream=cloudinary.uploader.upload_stream({folder:'foodsaver',resource_type:'image',allowed_formats:['jpg','png','webp'],transformation:[{width:1400,height:1000,crop:'limit'},{quality:'auto'},{fetch_format:'auto'}]},(error,result)=>error?reject(error):resolve(result));stream.end(bytes);});
  return result.secure_url;
}
