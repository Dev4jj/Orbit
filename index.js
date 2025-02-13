import express from "express";
import session from "express-session";
import path from 'path';
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import bcrypt from 'bcryptjs';
import pg from "pg";
import connectPgSimple from "connect-pg-simple";
import googleTrends from "google-trends-api";
import he from "he";


const app = express();
const pgSession = connectPgSimple(session);
dotenv.config();
const port = process.env.PORT || 8000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//connect to db

const db = new pg.Client({
user: process.env.USER,
host: process.env.HOST,
database: process.env.DB,
password: process.env.DB_PASSWORD,
port: process.env.DB_PORT,
});

db.connect()
.then(() => console.log('Connected to the database'))
.catch(err => console.error('Connection error', err.stack));

app.set('view engine', 'ejs' );
app.set('views', path.join(__dirname, 'src', 'views'));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({extended:true}));
app.use(session({
    store: new pgSession({
        pool: db,
        tableName: 'session',
    }),
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {secure: false,
        maxAge: 1000 * 60 * 60 * 24,
    }
}));

let access = 0; // check databse if user info matches then set access to true or false

app.get('/', (req, res)=>{
    res.render("index", {access});
})

// check if user already exists in future database
app.post('/signup', async(req, res)=>{
    access = 0;
    const {fName, username} = req.body;
    
try{
    const existingUser = await db.query(`SELECT * FROM users WHERE username = $1`, [username]);
    if (existingUser.rows.length > 0){
        return res.status(400).json({message: "Username already exists"});
    }

    const salt = await bcrypt.genSalt(10);
    const secPass = await bcrypt.hash(req.body.password, salt);

    await db.query(`INSERT INTO users (first_name, username, password) VALUES ($1, $2, $3)`, [fName, username, secPass]);
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
        const userRes = await db.query(`SELECT * FROM users WHERE username = $1`, [username]);
        const user = userRes.rows[0];
    
        if(!user){
            console.log("Login attempt with invalid username:", username);
            return res.redirect("/");
        }

        const checkPas = await bcrypt.compare(password, user.password);

        if (!checkPas){
            console.log("Login attempt with invalid password for username:", username);
           return res.redirect("/");
        }

req.session.username= user.username;

    console.log('User is logged in', user.username);
    return res.redirect("/profile");
    
    }catch(err){
        console.log(err);
        res.redirect("/");
    }
});


app.get("/profile", async(req, res) => {
    const searched = req.query.search || "";

    if (!req.session.username) {
        return res.redirect("/login"); 
    }

    const username = req.session.username;

    try{
    
    const userRes = await db.query(`SELECT * FROM users WHERE username = $1`, [username]);
    const user = userRes.rows[0];

    //all users except logged in user
    const usersNotYou = await db.query(`SELECT * FROM users WHERE username != $1`, [username])
    const orbitUsers = usersNotYou.rows;

if (!user) {
    return res.status(404).json({ message: "User not found" });
}
        // Fetch posts for users

        
       const postRes = await db.query(`
            SELECT users.first_name, users.username, users.id AS user_id, posts.id AS post_id, posts.content, posts.created_at
            FROM posts
            JOIN users ON posts.user_id = users.id
            WHERE posts.content ILIKE $1
         OR users.first_name ILIKE $1
         OR users.username ILIKE $1
      ORDER BY posts.created_at DESC;
    `, [`%${searched}%`]);

    //Fetch all comments

        const commentRes = await db.query(`
            SELECT comments.post_id, comments.comment, comments.comment_username, comments.created_at AS comment_at_time
            FROM comments
            ORDER BY comments.created_at DESC;
            `);

        const allPosts = postRes.rows;
        const allComments = commentRes.rows;
           
            access = 1; 
            res.render("index", { access, user, allPosts, orbitUsers, searched, allComments });
       
}catch(err){
    console.error("Error occurred while fetching user data or posts:", err);
    return res.status(500).json({ message: "Server error" });
}});

//trending page

app.get("/trending", async(req, res)=>{
const {username} = req.session;

if(!username){
    return res.status(401).redirect('/profile');
}

function volumeConverter(vol){
if(!vol){return 0}

const volStr = vol.replace(/[^\dKMB+]/g, ''); //regular expressions outout: replaces anything not specified(not: numbers, or K,M,B+)
const volValue = parseFloat(volStr.replace(/[^\d]/g, '')); //output: replaces anything not specified(not: numbers)

if(volStr.includes("K")){
    return volValue * 1000;
}else if(volStr.includes("M")){
    return volValue * 1000000;
}else{
    return volValue;
}
}

try{
googleTrends.dailyTrends({
    geo:'US',
}, function(err, results){
    
    if(err){
        console.log(err);
    }else{
        try{
            
            const parsedResults = JSON.parse(results);
        const trendsArray = parsedResults.default.trendingSearchesDays.map((day) => {
                return day.trendingSearches.map(trend => {
                    return{
                        topic: trend.title.query,
                        volume: trend.formattedTraffic,
                        snippet: he.decode(trend.articles[0]?.snippet)
                    }
                });
        }) 
        const flatArray = trendsArray.flat().slice(0,20);
        const sortedTrends = flatArray.sort((a,b)=>{
            return( volumeConverter(b.volume) - volumeConverter(a.volume))
        });
console.log(sortedTrends);
access=2;
res.render("index", {access, trends: sortedTrends});
    }catch(err){
        console.log(err);
    }
    }
});


}catch(err){
    console.log(err);
}
})

app.get("/users", async(req, res)=>{
    const {username} = req.session;

    if(!username){
        return res.status(401).redirect('/profile');
    }
    
    try{
    const usersNotYou = await db.query(`SELECT * FROM users WHERE username != $1`, [username])
    const orbitUsers = usersNotYou.rows;

    access=3;
    res.render("index", {access, orbitUsers });
    }catch(err){
    console.error("Error occurred while fetching user data or posts:", err);
    }
})


//user makes a post

app.post("/post", async(req, res)=>{ 
    const {username} = req.session;
    const {content} = req.body;

    if(!username){
        return res.status(401).redirect('/profile');
    }

    try{
    const userRes = await db.query(`SELECT * FROM users WHERE username = $1`, [username]);
    const user = userRes.rows[0];

    if(!user){
        return res.status(400).json({message: "User not found."});
    }

    //Logic for a post
    await db.query(`INSERT INTO posts (user_id, content) VALUES ($1, $2)`, [user.id, content]);

    console.log("User made a post:", content);

    res.redirect("/profile");
    
    }catch(err){
        console.log(err);
    }
})

//user makes a comment on post

app.post("/post/comment", async(req, res)=>{
    const{comment, post_id, user_id} = req.body;
    const{username} = req.session;

    if(!username){
        return res.status(401).redirect('/profile');
    }

    if (!user_id || !comment || !post_id) {
        return res.status(400).redirect('/profile');
    }

    try{

        await db.query(`INSERT INTO comments (post_id, user_id, comment, comment_username) VALUES ($1, $2, $3, $4)`, [post_id, user_id, comment, username]);
        console.log("User made a comment:", comment);

        res.redirect("/profile");
    }catch(err){
        console.log(err);
    }
})

//user updates profile

app.post("/update", async(req, res)=>{
    const{fnUpdate, bioUpdate} = req.body;
    const {username} = req.session;

    if(!fnUpdate && !bioUpdate){
        console.log("No fields to update.");
        return res.status(400).redirect("/profile");
    }

    try{

        const userCheck = await db.query(`SELECT * FROM users WHERE username = $1`, [username]);
        const userExists = userCheck.rows.length > 0;

        if(!userExists){
           console.log(err);
        }

        if(fnUpdate){
            await db.query(`UPDATE users SET first_name = $1 WHERE username = $2`, [fnUpdate, username]);
            console.log("First name updated");
        }

        if(bioUpdate){
            await db.query(`UPDATE users SET bio = $1 WHERE username =  $2`, [bioUpdate, username]);
            console.log("Bio updated");
        }
    res.redirect("/profile");

    }catch(err){
        console.log(err);
        res.status(500).json({message: "Error updating user account"});
    }
})

//user navigates to loggout

app.get("/logout", (req, res)=>{
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send({ message: "Error during logout." });
        }
        res.clearCookie("connect.sid"); 
        access=0;
        res.render('index', {access})  
    });
    console.log("user logged out");
});

app.post("/delete-account", async(req, res)=>{
const{confirmed} = req.body;
const {username} = req.session;

if(!username){
    return res.status(401).send({message: "User cant be identified"})
}

if(confirmed){
    try{
    console.log("Deleting account...");
    await db.query(`DELETE FROM comments WHERE comment_username = $1`, [username]);
    await db.query(`DELETE FROM users WHERE username = $1`, [username]);

        req.session.destroy((err)=>{
            if(err){return res.status(500).send({message: "Error while logging out."})}
        });

       res.redirect('/');
    
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