import { randomBytes } from 'node:crypto';
const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...randomBytes(20)].map(b=>b.toString(2).padStart(8,'0')).join('');
const secret=bits.match(/.{5}/g).map(x=>chars[parseInt(x,2)]).join('');
console.log('Keep this secret on the server and in your authenticator only:');console.log(secret);
console.log(`otpauth://totp/FoodSaver:Admin?secret=${secret}&issuer=FoodSaver&algorithm=SHA1&digits=6&period=30`);
