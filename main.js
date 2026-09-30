import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "redis";
import { RedisStore } from "connect-redis";
import cors from "cors";
import "dotenv/config";

import db from "./routes/api/shared/db.js";

import root from "./routes/root.js";
import login from "./routes/api/auth/login.js";
import signup from "./routes/api/auth/signup.js";
import getUser from "./routes/api/auth/getUser.js";
import getfriends from "./routes/api/friends/getfriends.js";
import addfriends from "./routes/api/friends/add.js";

import learn from "./routes/api/learn/learn.js";
import quests from "./routes/api/quests/quests.js";
import achievements from "./routes/api/achievements/achievements.js";
import streak from "./routes/api/streak/streaks.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
    origin: "*",
    credentials: true
}));

export const redisClient = createClient({
    url: process.env.REDIS_URL
});

redisClient.on("error", (err) => {
    console.error("[REDIS]", err);
});

await redisClient.connect();

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.use(session({
    store: new RedisStore({
        client: redisClient
    }),

    secret: process.env.SESSION_SECRET,

    resave: false,
    saveUninitialized: false,

    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 30
    }
}));

app.use("/", root(db));

app.use("/api/auth/login", login);
app.use("/api/auth/signup", signup);
app.use("/api/auth/getUser", getUser);

app.use("/api/friends/getfriends", getfriends);
app.use("/api/friends/add", addfriends);

app.use("/api/learn", learn);
app.use("/api/quests", quests);
app.use("/api/achievements", achievements);
app.use("/api/streak", streak);

app.listen(port, () => {
    console.log("Server is running on port " + port);
});
