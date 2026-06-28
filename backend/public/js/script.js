
import { io } from "https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.8.1/socket.io.esm.min.js";

const socket = io();

if(navigator.geolocation){
    navigator.geolocation.watchPosition((position)=>{
        const {latitude, longitude}= position.coords;
        socket.emit('send-location',{latitude,longitude});
    },(error)=>{
        console.log(error);
    },{
        enableHighAccuracy:true,
        timeout:5000,
        maximumAge:0
    })
}

const map=L.map('map').setView([0,0],10);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:"SMAP Location"
}).addTo(map);

const marker={}

socket.on("receive-location",(data)=>{
    const {id, latitude,longitude}=data;
    map.setView([latitude,longitude],10);

    if(marker[id]){
        marker[id].setLatLng([latitude,longitude]);
    }else{
        marker[id]=L.marker([latitude,longitude]).addTo(map)
    }
})

socket.on("user-disconnected",(id)=>{
    if(marker[id]){
        map.removeLayer(marker[id]);
        delete marker[id];
        }
})