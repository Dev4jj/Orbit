import express from "express";
import path from 'path';
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import bcrypt from 'bcryptjs';
import pg from "pg";
const app = express();
dotenv.config();
const port = process.env.PORT || 8000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log(process.env.PORT)

//connect to db

const db = new pg.Client({
user: process.env.USER,
host: process.env.HOST,
database: process.env.DB,
password: process.env.DB_PASSWORD,
port: process.env.DB_PORT,
});
db.connect();

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
app.post('/signup', async(req, res)=>{
    access = false;
    const {fName, username} = req.body;
    

try{
    const existingUser = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0){
        return res.status(400).json({message: "Username already exists"});
    }

    const salt = await bcrypt.genSalt(10);
    const secPass = await bcrypt.hash(req.body.password, salt);

    await db.query('INSERT INTO users (first_name, username, password) VALUES ($1, $2, $3)', [fName, username, secPass]);
    console.log("user was created");
    res.render("index", {access});
    
    }catch(err){
        console.log(err);
        res.status(500).json({message: "Server error"});
    };
    
});

app.post('/login', async(req, res)=>{
   
    const {username, password}= req.body;

    try{
        const userRes = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = userRes.rows[0];
        console.log(password);
        console.log(user.password);
    

        if(!user){
            console.log("Login attempt with invalid username:", username);
            return res.status(400).json({message: "Invalid username or password"});
        }

        const checkPas = await bcrypt.compare(password, user.password);

        if (!checkPas){
            console.log("Login attempt with invalid password for username:", username);
            return res.status(400).json({message: "Invalid password"});
        }
    access = true;
    res.render("index", {access});
    console.log('User is logged in');
    }catch(err){
        console.log(err);
        res.status(500).json({message: "Server error"});
    }
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