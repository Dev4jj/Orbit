import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import pg from "pg";
import connectPgSimple from "connect-pg-simple";
import { createServer } from "http";
import { Server } from "socket.io";
import axios from "axios";
import multer from "multer";
import getFriendsList from "./friendsList.js";
import fs from "fs";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);


dotenv.config();
const port = process.env.PORT || 8000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//connect to db
//remove "conncetionString and ssl if not using render"
const {Pool} =pg;
const db = new Pool({
connectionString: process.env.DATABASE_URL,
ssl:{
  rejectUnauthorized: false,
},
  /*
  user: process.env.USER,
  host: process.env.HOST,
  database: process.env.DB,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,*/
});

db.connect()
  .then(() => console.log("Connected to the database"))
  .catch((err) => console.error("Connection error", err.stack));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src", "views"));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
const pgSession = connectPgSimple(session);
app.use(
  session({
    store: new pgSession({
      pool: db,
      tableName: "session",
    }),
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV ==="production", sameSite: process.env.NODE_ENV ==="production"? "none":"lax", maxAge: 1000 * 60 * 60 * 24 },
  })
);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/pfps')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname)
    cb(null, file.fieldname + "-" + uniqueSuffix + extension)
  }
})

const upload = multer({ storage: storage })

const newsDataUrl = `https://newsdata.io/api/1/latest?apikey=${process.env.NEWS_KEY}`; //api url for trending page

app.get("/", (req, res) => {
  const access = req.session.access || 0;
  res.render("index", { access, searched:"" });
});

app.get("/login", (req, res)=>{
  res.redirect("/")
})
//remove io connection
io.on("connection", (socket) => {
  console.log("User is connected");
});

// check if user already exists in future database
app.post("/signup", async (req, res) => {
  
  const { fName, username } = req.body;

  try {
    const existingUser = await db.query(
      `SELECT * FROM users WHERE username = $1`,
      [username]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const secPass = await bcrypt.hash(req.body.password, salt);

    await db.query(
      `INSERT INTO users (first_name, username, password) VALUES ($1, $2, $3)`,
      [fName, username, secPass]
    );
    console.log("user was created");
    res.render("index", { access:0, searched:"" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const userRes = await db.query(`SELECT * FROM users WHERE username = $1`, [
      username,
    ]);
    const user = userRes.rows[0];

    if (!user) {
      console.log("Login attempt with invalid username:", username);
      return res.redirect("/login");
    }

    const checkPas = await bcrypt.compare(password, user.password);

    if (!checkPas) {
      console.log(
        "Login attempt with invalid password for username:",
        username
      );
      return res.redirect("/login");
    }

    req.session.username = user.username;
    req.session.myid = user.id;
    req.session.access=1;

    console.log("User is logged in:", user.username);
    return res.redirect("/profile");
  } catch (err) {
    console.log(err);
    res.redirect("/login");
  }
});

app.get("/profile", async (req, res) => {
  const searched = req.query.search || "";
  const { myid } = req.session;

  if (!req.session.username) {
    return res.redirect("/login");
  }

  const username = req.session.username;

  try {
    const userRes = await db.query(`SELECT * FROM users WHERE username = $1`, [
      username,
    ]);
    const user = userRes.rows[0];

    //all users except logged in user
    const usersNotYou = await db.query(
      `SELECT * FROM users WHERE username != $1`,
      [username]
    );
    const orbitUsers = usersNotYou.rows;

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    /*friends list */
    const friendsList = await getFriendsList(db, myid);
    // Fetch posts for users

    const postRes = await db.query(
      `
            SELECT users.first_name, users.username, users.id AS user_id, posts.id AS post_id, posts.content, posts.friends_only, posts.created_at
            FROM posts
            JOIN users ON posts.user_id = users.id
            WHERE posts.content ILIKE $1
         OR users.first_name ILIKE $1
         OR users.username ILIKE $1
      ORDER BY posts.created_at DESC;
    `,
      [`%${searched}%`]
    );

    const allPosts = postRes.rows;

    const myFriendsQuery = await db.query(
      `
    SELECT DISTINCT
    CASE 
    WHEN user1_id = $1 THEN user2_id
    ELSE user1_id
    END AS friend_id
    FROM friends
    WHERE user1_id = $1 OR user2_id = $1;
        `,
      [myid]
    );

    const friendIds = myFriendsQuery.rows.map((row) => row.friend_id);

    const visiblePosts = allPosts.filter((post) => {
      if (!post.friends_only) return true;
      return friendIds.includes(post.user_id) || post.user_id === myid;
    });

    //Fetch all comments

    const commentRes = await db.query(`
            SELECT comments.post_id, comments.comment, comments.comment_username, comments.created_at AS comment_at_time
            FROM comments
            ORDER BY comments.created_at DESC;
            `);

    const allComments = commentRes.rows;

    req.session.access = 1;
    res.render("index", {
      access: req.session.access,
      user,
      allPosts: visiblePosts,
      orbitUsers,
      searched,
      allComments,
      friendsList,
      searched 
    });
  } catch (err) {
    console.error("Error occurred while fetching user data or posts:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

//User updates profile picture
app.post("/profile/upload-pfp", upload.single('pfp'),async (req, res)=>{
    const { myid } = req.session;

  try{
console.log(req.file);
const newpfpPath = `/uploads/pfps/${req.file.filename}`;

const {rows} = await db.query(`SELECT pfp FROM users WHERE id = $1`, [myid]);
console.log(rows[0].pfp)
const oldPfp = rows[0]?.pfp;

if(oldPfp && oldPfp !== "/images/profile-user.png"){
const oldPfpPath = path.join(__dirname, "public", oldPfp)


  fs.unlink(oldPfpPath, (err)=>{
    if(err){
      console.log("Unable to delete old Pfp file", err);
    }else{
      console.log("old pfp file successfully deleted");
    }
  })
}
await db.query(`UPDATE users SET pfp = $1 WHERE id = $2`, [newpfpPath, myid]);
console.log("success you accessed the update pfp route");
res.redirect("/profile");

  }catch(err){
console.log("Error occured when uploading image", err);
  }
})

//user makes a post

app.post("/post", async (req, res) => {
  const { username } = req.session;
  const { content, isFriend } = req.body;
  console.log(isFriend);

  if (!username) {
    return res.status(401).redirect("/profile");
  }

  try {
    const userRes = await db.query(`SELECT * FROM users WHERE username = $1`, [
      username,
    ]);
    const user = userRes.rows[0];

    if (!user) {
      return res.status(400).json({ message: "User not found." });
    }

    //Logic for a post
    await db.query(
      `INSERT INTO posts (user_id, content, friends_only) VALUES ($1, $2, $3)`,
      [user.id, content, isFriend]
    );

    console.log("User made a post:", content);

    res.redirect("/profile");
  } catch (err) {
    console.error("Error occured while making a post", err);
  }
});

//user deletes their post
app.post("/post/delete/:postid",async(req, res)=>{
const {postid}=req.params;
const {myid}=req.session;
try{

  await db.query(
    `DELETE FROM posts WHERE id=$1 AND user_id=$2`, [postid, myid]
  );

  console.log("Deleted post with id:", postid);
  res.redirect("/profile");

}catch(err){
  console.log("Unable to delete post",err);
}
})

//user makes a comment on post

app.post("/post/comment", async (req, res) => {
  const { comment, post_id, user_id } = req.body;
  const { username } = req.session;

  if (!username) {
    return res.status(401).redirect("/profile");
  }

  if (!user_id || !comment || !post_id) {
    return res.status(400).redirect("/profile");
  }

  try {
    await db.query(
      `INSERT INTO comments (post_id, user_id, comment, comment_username) VALUES ($1, $2, $3, $4)`,
      [post_id, user_id, comment, username]
    );
    console.log("User made a comment:", comment);

    res.redirect("/profile");
  } catch (err) {
    console.log(err);
  }
});

//trending page

app.get("/trending", async (req, res) => {
  const { username, myid } = req.session;

  if (!username) {
    return res.status(401).redirect("/profile");
  }

  try {
    const friendsList = await getFriendsList(db, myid);

    const response = await axios.get(
      newsDataUrl +
        `&language=en&country=ca&removeduplicate=1&size=10&image=1&prioritydomain=top`
    );
    const allArticles = response.data.results;

    const userRes = await db.query(`SELECT * FROM users WHERE username = $1`, [
      username,
    ]);
    const user = userRes.rows[0];

    req.session.access = 2;
    res.render("index", { access:req.session.access, allArticles, friendsList, user, searched:"" });
  } catch (err) {
    console.error("Error occured while fetching trending data:", err);
    res.status(500).json({ message: "Server error" });
  }
});

//users list page

app.get("/users", async (req, res) => {
  const { username, myid } = req.session;
  const findUser =req.query.findUser || "";
  console.log(findUser);

  if (!username || !myid) {
    return res.status(401).redirect("/profile");
  }

  try {
    const friendsList = await getFriendsList(db, myid);

    const {rows: orbitUsersFiltered}= await db.query(
      `
      SELECT users.id, users.first_name, users.username
      FROM users
      WHERE users.id!=$1
      AND users.id NOT IN(
      SELECT CASE
      WHEN friends.user1_id=$1 THEN friends.user2_id
      ELSE friends.user1_id
      END 
      FROM friends
      WHERE friends.user1_id=$1 OR friends.user2_id=$1
      )
      AND (users.username ILIKE '%' || $2 || '%' OR users.first_name ILIKE '%' || $2 || '%')
      ORDER BY users.first_name ASC
      `,
      [myid, findUser]
    );
/*
    const usersNotYou = await db.query(
      `SELECT * FROM users WHERE username != $1`,
      [username]
    );
    const orbitUsers = usersNotYou.rows;
*/
    const sentRequest = await db.query(
      `
        SELECT fr.id, fr.sender_id, fr.recipient_id, users.first_name AS sender_fn, users.username AS sender_un
        FROM friend_requests fr
        INNER JOIN users ON fr.sender_id = users.id
        WHERE fr.recipient_id = $1
    `,
      [myid]
    );
    const receivedRequests = sentRequest.rows;
/*
    const friendships = await db.query(
      `
        SELECT user1_id, user2_id FROM friends
        WHERE user1_id = $1 OR user2_id = $1
        `,
      [myid]
    );

    console.log(friendships.rows);
    const friendIds = new Set();

    friendships.rows.forEach((friend) => {
      if (friend.user1_id == myid) {
        friendIds.add(friend.user2_id);
      } else {
        friendIds.add(friend.user1_id);
      }
    });

    const orbitUsersFiltered = orbitUsers.filter(
      (user) => !friendIds.has(user.id)
    );
    console.log(orbitUsersFiltered);
*/
    const userRes = await db.query(`SELECT * FROM users WHERE username = $1`, [
      username,
    ]);
    const user = userRes.rows[0];

    req.session.access = 3;
    res.render("index", {
      access:req.session.access,
      orbitUsersFiltered,
      findUser,
      receivedRequests,
      friendsList,
      user, 
      searched:""
    });
  } catch (err) {
    console.error("Error occurred while fetching user data or posts:", err);
    res.status(500).send(`An error occured: ${err.message}`);
  }
});


app.post("/sent_friend_req", async (req, res) => {
  const { username } = req.session;
  const { myid } = req.session;
  const recipientId = req.body.recipient_id;

  if (!username) {
    return res.status(401).redirect("/profile");
  }

  try {
    await db.query(
      `INSERT INTO friend_requests (sender_id, recipient_id) VALUES ($1, $2)`,
      [myid, recipientId]
    );

    console.log(`succefully sent request to recipent_id:${recipientId}`);

    res.redirect("/users");
  } catch (err) {
    console.error("Error occured while sending friend request:", err);
    res.status(500).send(`An error occured: ${err.message}`);
  }
});


app.post("/accept_deny_req", async (req, res) => {
  const { username } = req.session;
  const { accept_deny, sender_id } = req.body;
  const { myid } = req.session;

  if (!username) {
    return res.status(401).redirect("/profile");
  } else if (!accept_deny || !sender_id) {
    console.log("missing request parameters");
    return res.status(400).redirect("/profile");
  }

  try {
    if (accept_deny == "1") {
      await db.query(
        `INSERT INTO friends (user1_id, user2_id) VALUES ($1, $2), ($2, $1)`,
        [myid, sender_id]
      );
      await db.query(
        `DELETE FROM friend_requests WHERE sender_id = $1 AND recipient_id = $2`,
        [sender_id, myid]
      );
      console.log("You accepted the friend request");
    } else if (accept_deny == "2") {
      await db.query(
        `DELETE FROM friend_requests WHERE sender_id = $1 AND recipient_id = $2`,
        [sender_id, myid]
      );
      console.log("You declined the friend request");
    } else {
      console.err("Invalid request:", err);
      return res.status(400).redirect("/profile");
    }
    res.redirect("/users");
  } catch (err) {
    console.error("Error occured while responding to friend request:", err);
  }
});

//Removing user from your orbit

app.post("/unadd_request", async (req, res) => {
  const myid = req.session.myid;
  const unaddedId = req.body.unadded_friend_id;

  try {
    await db.query(
      `
            DELETE FROM friends
            WHERE
             (user1_id=$1 AND user2_id=$2)
            OR
             (user1_id=$2 OR user2_id=$1)
            `,
      [myid, unaddedId]
    );

    console.log("You deleted a user form your Orbit list");

    res.redirect("/profile");
  } catch (err) {
    console.err("Error occured while sending unfriend request", err);
  }
});

//user updates profile

app.post("/update", async (req, res) => {
  const { fnUpdate, bioUpdate } = req.body;
  const { username } = req.session;

  if (!fnUpdate && !bioUpdate) {
    console.log("No fields to update.");
    return res.status(400).redirect("/profile");
  }

  try {
    const userCheck = await db.query(
      `SELECT * FROM users WHERE username = $1`,
      [username]
    );
    const userExists = userCheck.rows.length > 0;

    if (!userExists) {
      console.log(err);
    }

    if (fnUpdate) {
      await db.query(`UPDATE users SET first_name = $1 WHERE username = $2`, [
        fnUpdate,
        username,
      ]);
      console.log("First name updated");
    }

    if (bioUpdate) {
      await db.query(`UPDATE users SET bio = $1 WHERE username =  $2`, [
        bioUpdate,
        username,
      ]);
      console.log("Bio updated");
    }
    res.redirect("/profile");
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error updating user account" });
  }
});

//user navigates to loggout

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send({ message: "Error during logout." });
    }
    res.clearCookie("connect.sid");
  
    res.render("index", { access:0, searched: "" });
  });
  console.log("user logged out");
});

app.post("/delete-account", async (req, res) => {
  const { confirmed } = req.body;
  const { username } = req.session;

  if (!username) {
    return res.status(401).send({ message: "User cant be identified" });
  }

  if (confirmed) {
    try {
      console.log("Deleting account...");
      await db.query(`DELETE FROM comments WHERE comment_username = $1`, [
        username,
      ]);
      await db.query(`DELETE FROM users WHERE username = $1`, [username]);

      req.session.destroy((err) => {
        if (err) {
          return res.status(500).send({ message: "Error while logging out." });
        }
      });

      res.redirect("/");
    } catch (error) {
      console.error("Error deleting account:", error);
      return res
        .status(500)
        .send({ message: "An error occurred while deleting the account." });
    }
  } else {
    return res.status(400).send({ message: "Account deletion not confirmed" });
  }
});
//remone "0.0.0.0 if not using render"
httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on port ${port}`);
});
