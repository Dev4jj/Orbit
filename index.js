import express from "express";
import path from 'path';
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const app = express();
dotenv.config();
const port = process.env.PORT || 8000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log(process.env.PORT)

//create future database with postgres

app.set('view engine', 'ejs' );
app.set('views', path.join(__dirname, 'src', 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({extended:true}));

let access = true; // check databse if user info matches then set access to true or false

app.get('/', (req, res)=>{
    res.render("index", {access});
})

// check if user already exists in future database
app.post('/signup', (req, res)=>{
    res.redirect("index");
    console.log("Post was called");
    console.log(req.body);
});

app.get('/login', (req, res)=>{
    access = true;
    res.render("index", {access});
    console.log('User is logged in');
    console.log(req.body);
});

//user makes a post

app.post("/post", (req, res)=>{
    res.render("index", {access});
    console.log("User made a post");
    console.log(req.body);
})

//user updates profile

app.post("/update", (req, res)=>{
    res.render("index", {access});
    console.log("User account updated");
    console.log(req.body);
})

//user navigates to loggout

app.get("/loggout", (req, res)=>{
   access = false;
    res.render("index", {access});
    console.log("user logged out");
})

app.listen(port, ()=>{
    console.log(`Server is running on port ${port}`);
});