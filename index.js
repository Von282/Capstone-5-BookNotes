import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
import pg from 'pg';
import bcrypt from 'bcrypt';
import env from 'dotenv';
import session from 'express-session';
import passport from 'passport';
import { Strategy } from 'passport-local';
import GoogleStrategy from 'passport-google-oauth2';
import e from 'express';

const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false, 
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT
});
db.connect();

async function authorPresent(name) {
    const result = await db.query("SELECT author FROM author");
    const rows = result.rows;
    let found = false
    rows.forEach((writer) => {
        if(writer.author === name)
            found = true;
    });
    return found;
}

async function getAuthorId(name) {
    const result = await db.query("SELECT id FROM author WHERE LOWER(author) = $1", [name]);
    return result.rows[0].id;
}

//Goes home
app.get("/", async (req, res) => {
    res.render("home.ejs");
});

//Renders the login page
app.get("/login", (req, res) => {
    res.render("login.ejs");
});

//Logout user and render home page
app.get("/logout", (req, res) => {
    req.logout((err) => {
        if(err) console.log("Error logging out: ", err);
        res.redirect("/");
    });
});

//Renders the register page
app.get("/register", (req, res) => {
    res.render("register.ejs");
})

//Displays the page to add books
app.get("/add", (req, res) => {
    res.render("add.ejs");
});

//Goes to the page displaying the book details + review
app.get("/book/:id", async (req, res) => {
    const id = req.params.id;
    const col = "author.id, author, book.id, title, isbn, rating, TO_CHAR(dateread, 'dd/mm/yyyy'), review, authorid";
    const query = `SELECT ${col} FROM author JOIN book ON book.id = ${id}`;

    try {
        const result = await db.query(query);

        res.render("book.ejs", { info: result.rows[0]});
    } catch (err) {
        console.log(err);
    }
});

//Display books in home page default order 
app.get("/default", async (req, res) => {
    res.redirect("/index");
});

//Display books in home page sorted by rating
app.get("/rating", async (req, res) => {
    const result = await db.query("SELECT * FROM book WHERE userid = $1 ORDER BY rating DESC", [req.user.id]);
    const lib = result.rows;

    res.render("index.ejs", {library: lib});
});

//Display books in home page sorted by recency
app.get("/recency", async (req, res) => {
    const result = await db.query("SELECT * FROM book WHERE userid = $1 ORDER BY dateread DESC", [req.user.id]);
    const lib = result.rows;

    res.render("index.ejs", {library: lib});
});

//Checks if user is authenticated, if so sends the index page. if not go back to login
app.get("/index", async (req, res) => {
    //req.user.id kept coming up undefined. Had to disable third-party cookies.
    //const userId = req.user.id; //https://stackoverflow.com/questions/62814983/req-user-undefined-despite-successful-signup-with-passport-and-express-session-o
    console.log("User:", req.user);
    
    if(req.isAuthenticated()) {
        try {
            //Get all books from DB
            const result = await db.query("SELECT * FROM book WHERE userid = $1", [req.user.id]);
            const lib = result.rows;
            
            res.render("index.ejs", {library: lib});
        } catch (err) {
            console.log("Could not execute query", err);
        }
    } else {
        res.redirect("/login");
    }
});

//The google consent page, asks for user profile and email
app.get("/auth/google", passport.authenticate("google", {
    scope: ["profile", "email"]
}));

//Activates Strategy. Goes to try and authenticate user, gets sent to the right page depending on verification. 
app.get("/auth/google/index", passport.authenticate("google", {
    successRedirect: "/index",
    failureRedirect: "/login"
}));

//Activates Strategy. Goes to try and authenticate user, gets sent to the right page depending on verification. 
app.post("/login", passport.authenticate("local", {
    successRedirect: "/index",
    failureRedirect: "/login"
}));

//Inserts username and password into DB and render index.ejs
app.post("/register", async (req, res) => {
    const userNameInput = req.body.username;
    const passwordInput = req.body.password;

    try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [userNameInput]);

        if(result.rows.length > 0) {
            res.send("User already exists. Try logging in");
        } else {
            bcrypt.hash(passwordInput, saltRounds, async (err, hash) => {
                if(err) {
                    console.log("Error hashing password: ", err);
                } else {
                    const insertedResult = await db.query("INSERT INTO users (email, password) VALUES ($1, $2)", [
                        userNameInput, hash
                    ]);
                    //console.log(insertedResult);
                    res.redirect("/index");
                }
            });
        }
    } catch (err) {
        console.log("Error registering: ", err);
    }
    
});

//Searches DB for username and password and render index.ejs
// app.post("/login", async (req, res) => {
//     const userNameInput = req.body.username;
//     const passwordInput = req.body.password;

//     try {
//         const userResult = await db.query("SELECT * FROM users WHERE username = $1", [userNameInput]);
//         const storedPassword = userResult.rows[0].password;

//         if(result.rows.length > 0) {
//             bcrypt.compare(passwordInput, storedPassword, (err, result) => {
//                 if(err) {
//                     console.log("Error comparing passwords: ", err);
//                 } else {
//                     if(result) {
//                         res.render("index.js");
//                     } else {
//                         res.send("Incorrect password");
//                     }
//                 }
//             });
//         } else {
//             res.send("User not found"); 
//         }
//     } catch (err) {
//         console.log(err);
//     }
// });

//Uses the user inputs to add book entry to DB and go homepage
app.post("/add", async (req, res) => {
    const authorName = req.body.author;
    const title = req.body.title;
    const isbn = req.body.isbn;
    const date = req.body.date;
    const review = req.body.review;
    const rating = req.body.rating;
    const userId = req.user.id;
    console.log("Adding:", userId);
    let authorId = 0;

    try {
        //If author is not in DB already, add them and get their id
        if(!(await authorPresent(authorName))) {
            const authorResult = await db.query("INSERT INTO author (author) VALUES ($1) RETURNING id", [authorName]);
            authorId = authorResult.rows[0].id;
        } else {
            //gets author id from DB
            authorId = await getAuthorId(authorName.toLowerCase());
        }
    } catch (err) {
        console.log(err);
    }

    try {
        //adds the book to the table using users input 
        await db.query("INSERT INTO book (title, isbn, rating, dateread, review, authorid, userid) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [title, isbn, rating, date, review, authorId, userId]);
         res.redirect("/index");
    } catch (err) {
        console.log("Error occured while adding book: ", err);
    }
});

//Updates a book review from the DB and reloads page
app.post("/edit", async (req, res) => {
    const id = req.body.id;
    const newReview = req.body["new-review"];

    try {
        await db.query("UPDATE book SET review = $1 WHERE id = $2", [newReview, id]);
        res.redirect("back");
    } catch (err) {
        console.log(err);
    }
});

//Deletes a book from DB
app.post("/delete/:id", async (req, res) => {
    const bookId = req.params.id;
    try {
        await db.query("DELETE FROM book WHERE id = $1", [bookId]);
        res.redirect("/");
    } catch (err) {
        console.log("Error while deleting book entry: ", err);
    }
    
});

//This strategy activates when user tries to log in and verifies them if username is found and password is correct,
passport.use("local", new Strategy(async function verify(username, password, cb) {
    try {
        const userResult = await db.query("SELECT * FROM users WHERE email = $1", [username]);

        if(userResult.rows.length > 0) {
            const user = userResult.rows[0];
            const storedPassword = user.password;
            bcrypt.compare(password, storedPassword, (err, result) => {
                if(err) {
                    //console.log("Error comparing passwords: ", err);
                    return cb(err);
                } else {
                    if(result) {
                        //res.render("index.js");
                        return cb(null, user);
                    } else {
                        //res.send("Incorrect password");
                        return cb(null, false);
                    }
                }
            });
        } else {
            //res.send("User not found"); 
            return cb("User not found");
        }
    } catch (err) {
        //console.log(err);
        return cb(err);
    }
}));

//This strategy activates when user tries to log in and verifies them if username is found and password is correct,
passport.use("google", new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/google/index',
    userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
}, async (accessToken, refreshToken, profile, cb) => {
    console.log(profile);
    try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [profile.email]);

        if(result.rows.length == 0) {
            const newUser = await db.query("INSERT INTO users (email, password) VALUES ($1, $2)", [profile.email, "google"]);
            cb(null, newUser.rows[0]);
        } else {
            //Users email already exist
            cb(null, result.rows[0]);
        }
    } catch (err) {
        cb(err);
    }
}));

//Registers a function used to serialize user objects into the session.
passport.serializeUser((user, cb) => {
    //console.log("Serialize user");
    cb(null, user);
});

//Registers a function used to deserialize user objects out of the session.
passport.deserializeUser((user, cb) => {
    //console.log("Deserialize user")
    cb(null, user);
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});