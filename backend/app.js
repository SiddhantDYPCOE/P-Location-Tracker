import express from "express";
import { Server } from "socket.io";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.render("index");
});

io.on("connection", (socket) => {
   
socket.on("send-location",(data)=>{
     console.log("New connection",socket.id,data);
    io.emit("receive-location",{id:socket.id, ...data});
})
    socket.on("disconnect", () => {
        io.emit("user-disconnected",socket.id)
    });
});

server.listen(3000, () => {
    console.log("Server is running on port 3000");
});