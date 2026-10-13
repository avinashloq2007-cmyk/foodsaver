import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import { config } from './config.js';
import { routes } from './routes.js';
import { loadSession } from './auth.js';
import { expireFood } from './services.js';
export function createApp(db){
  const app=express(),server=createServer(app),io=new Server(server,{cors:{origin:config.origin,credentials:true},maxHttpBufferSize:100000});
  app.disable('x-powered-by');if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'",'https://www.gstatic.com','https://www.google.com','https://www.recaptcha.net'],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:','https://images.unsplash.com','https://res.cloudinary.com','https://*.tile.openstreetmap.org'],connectSrc:["'self'",'https://*.googleapis.com','https://*.firebaseapp.com','https://*.firebaseio.com','https://www.gstatic.com','https://securetoken.googleapis.com'],frameSrc:['https://www.google.com','https://www.recaptcha.net','https://*.firebaseapp.com'],workerSrc:["'self'",'blob:'],upgradeInsecureRequests:config.production&&config.origin.startsWith('https:')?[]:null}},crossOriginEmbedderPolicy:false}));
  app.use(express.json({limit:'32kb'}));
  app.use('/api',routes(db,io));
  app.use('/vendor/bootstrap',express.static(resolve('node_modules/bootstrap/dist')));
  app.use('/vendor/leaflet',express.static(resolve('node_modules/leaflet/dist')));
  app.use('/uploads',express.static(resolve('uploads'),{dotfiles:'deny',maxAge:'1d'}));
  app.use(express.static(resolve('public')));
  app.use('/api',(req,res)=>res.status(404).json({error:'API endpoint not found.'}));
  app.get('/{*path}',(req,res)=>res.sendFile(resolve('public/index.html')));
  app.use((error,req,res,next)=>{
    const status=error.status||(error.code==='LIMIT_FILE_SIZE'?400:500);
    if(status>=500)console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}: ${error.message}`);
    res.status(status).json({error:status<500?error.message:'Something went wrong. Please try again.'});
  });
  io.use(async(socket,next)=>{try {const origin=socket.handshake.headers.origin;if(origin&&origin!==config.origin)return next(new Error('Invalid origin'));const user=await loadSession(db,socket.request);if(!user||socket.handshake.auth.csrf!==user.csrf_token)return next(new Error('Authentication required'));socket.data.user=user;next();}catch{next(new Error('Authentication failed'));}});
  io.on('connection',socket=>{socket.join(`user:${socket.data.user.user_id}`);socket.join(`session:${socket.data.user.token_hash}`);});
  const socketCheck=setInterval(async()=>{for(const socket of io.sockets.sockets.values()){try{if(!await loadSession(db,socket.request))socket.disconnect(true);}catch{socket.disconnect(true);}}},60000);socketCheck.unref();
  const expiry=setInterval(()=>expireFood(db,io).catch(error=>console.error('Expiry worker:',error.message)),60000);expiry.unref();
  return {app,server,io,stop:async()=>{clearInterval(expiry);clearInterval(socketCheck);await new Promise(resolve=>io.close(resolve));await db.close();}};
}
