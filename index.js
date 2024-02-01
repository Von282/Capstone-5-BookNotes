import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
import pg from 'pg';

const app = express();
const port = 3000;

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "bookNotes",
  password: "#JMoore899",
  port: 5433
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

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
    try {
        const result = await db.query("SELECT * FROM book");
        const lib = result.rows;
        
        res.render("index.ejs", {library: lib});
    } catch (err) {
        console.log("Could not execute query", err);
    }
    
});

//Displays the page to add books
app.get("/add", (req, res) => {
    res.render("add.ejs");
});

//Uses the user inputs to add book entry to DB and go homepage
app.post("/add", async (req, res) => {
    const authorName = req.body.author;
    const title = req.body.title;
    const  isbn = req.body.isbn;
    const date = req.body.date;
    const review = req.body.review;
    const rating = req.body.rating;
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
        await db.query("INSERT INTO book (title, isbn, rating, dateread, review, authorid) VALUES ($1,$2,$3,$4,$5,$6)",
        [title, isbn, rating, date, review, authorId]);
         res.redirect("/");
    } catch (err) {
        console.log("Error occured while adding book: ", err);
    }
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
    res.redirect("/");
});

//Display books in home page sorted by rating
app.get("/rating", async (req, res) => {
    const result = await db.query("SELECT * FROM book ORDER BY rating DESC");
    const lib = result.rows;

    res.render("index.ejs", {library: lib});
});

//Display books in home page sorted by recency
app.get("/recency", async (req, res) => {
    const result = await db.query("SELECT * FROM book ORDER BY dateread DESC");
    const lib = result.rows;

    res.render("index.ejs", {library: lib});
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

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});