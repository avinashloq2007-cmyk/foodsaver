import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('public/vendor/bootstrap/css', { recursive: true });
mkdirSync('public/vendor/leaflet/images', { recursive: true });
mkdirSync('public/vendor/socket.io', { recursive: true });

cpSync('node_modules/bootstrap/dist/css/bootstrap.min.css', 'public/vendor/bootstrap/css/bootstrap.min.css');
cpSync('node_modules/leaflet/dist/leaflet.css', 'public/vendor/leaflet/leaflet.css');
cpSync('node_modules/leaflet/dist/leaflet.js', 'public/vendor/leaflet/leaflet.js');
cpSync('node_modules/leaflet/dist/images', 'public/vendor/leaflet/images', { recursive: true });
cpSync('node_modules/socket.io/client-dist/socket.io.min.js', 'public/vendor/socket.io/socket.io.min.js');

console.log('Vendor assets copied to public/vendor successfully.');
