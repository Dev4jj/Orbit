import express from "express";
import session from "express-session";
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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({extended:true}));
app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {secure: false}
}));

let access = false; // check databse if user info matches then set access to true or false

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

req.session.username= user.username;

    access = true;
    console.log('User is logged in', user.username);
    return res.render("index", {access, firstName: user.first_name, username: user.username, pfBio: user.bio});
    
    }catch(err){
        console.log(err);
        res.status(500).json({message: "Server error"});
    }
});

//user makes a post

app.post("/post", (req, res)=>{ 
    access = true;
    res.render("index", {access});
    console.log("User made a post");
    console.log(req.body);
})

//user updates profile

app.post("/update", async(req, res)=>{
    const{fnUpdate, bioUpdate} = req.body;
    const {username} = req.session;

    if(!fnUpdate && !bioUpdate){
        return ( res.status(400).send("No fields to update."))
    }

    try{

        const userCheck = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        const userExists = userCheck.rows.length > 0;

        if(!userExists){
           console.log(err);
        }

        if(fnUpdate){
            await db.query('UPDATE users SET first_name = $1 WHERE username = $2', [fnUpdate, username]);
            console.log("First name updated");
        }

        if(bioUpdate){
            await db.query('UPDATE users SET bio = $1 WHERE username =  $2', [bioUpdate, username]);
            console.log("Bio updated");
        }

        const userRes = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = userRes.rows[0];

    console.log("User account updated");
    console.log(req.body);
    console.log(username);
    console.log(user);
    access = true;
    res.render("index", {access, firstName: user.first_name, username: user.username, pfBio: user.bio});

    }catch(err){
        console.log(err);
        res.status(500).json({message: "Error updating user account"});
    }
})

//user navigates to loggout

app.get("/loggout", (req, res)=>{
   access = false;
    res.render("index", {access});
    console.log("user logged out");
});

app.post("/delete-account", async(req, res)=>{
const{confirmed} = req.body;
const {username} = req.session;

console.log(req.body)

if(!username){
    return res.status(401).send({message: "User cant be identified"})
}

if(confirmed){
    try{
    console.log("Deleting account...");
    await db.query('DELETE FROM users WHERE username = $1', [username]);

        req.session.destroy((err)=>{
            if(err){return req.status(500).send({message: "Error while logging out."})}
        });

    access = false;
    res.render("index", {access});
    
    }catch(error){
      console.error("Error deleting account:", error);
      return res.status(500).send({message: "An error occurred while deleting the account."});
    }
}else{
    return res.status(400).send({message: "Account deletion not confirmed"});
}
});

app.listen(port, ()=>{
    console.log(`Server is running on port ${port}`);
});