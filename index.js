import express from "express";
import path from 'path';
import { fileURLToPath } from "url";
const app = express();
const port = 8000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('view engine', 'ejs' );
app.set('views', path.join(__dirname, 'src', 'views'));


app.use(express.static(path.join(__dirname, 'public')));



app.get('/', (req, res)=>{
    res.render("index");
})

app.listen(port, ()=>{
    console.log(`Server is running on port ${port}`);
})