const express = require("express");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3");
const path = require("path");
const { open } = require("sqlite");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");
let db;
const secret_token = "awDEklIE_dselOOne_serc";

(async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server started at port: 3000");
    });
  } catch (error) {
    console.log(error.message);
  }
})();

// Utility functions
const isStrongPassword = (password) =>
  password.length < 6 ? "Password is too short" : true;

const authenticateAccessToken = (req, res, next) => {
  const authorHeader = req.headers["authorization"];
  let jwtToken;
  if (authorHeader !== undefined) {
    jwtToken = authorHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, secret_token, async (err, payload) => {
      if (err) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.username = payload.username;
        next();
      }
    });
  }
};

const getUserByUserName = async (username) => {
  const getUserQuery = `SELECT * FROM user WHERE username = ?;`;
  return await db.get(getUserQuery, username);
};

// Creating new user in DB API -1
app.post("/register/", async (req, res) => {
  const { username, password, name, gender } = req.body;

  // check if user already exists
  const isUserExists = await getUserByUserName(username);

  if (isUserExists !== undefined) {
    res.status(400);
    res.send("User already exists");
  } else {
    const isValidPassword = isStrongPassword(password); //checking for password length
    if (isValidPassword !== true) {
      res.status(400);
      res.send(isValidPassword);
    } else {
      const encryptedPassword = await bcrypt.hash(password, 10);
      const newUserQuery = `INSERT INTO user (name, username, password, gender)
          VALUES (?, ?, ?, ?);`;
      await db.run(newUserQuery, [name, username, encryptedPassword, gender]);

      res.status(200);
      res.send("User created successfully");
    }
  }
});

// Login API - 2
app.post("/login/", async (req, res) => {
  try {
    const { username, password } = req.body;

    // check user exists
    const userExists = await getUserByUserName(username);

    if (userExists === undefined) {
      res.status(400);
      res.send("Invalid user");
    } else {
      // check for password
      const isPasswordMatching = await bcrypt.compare(
        password,
        userExists.password
      );

      //   if password matches ? Then create jwtToken
      if (isPasswordMatching === false) {
        res.status(400);
        res.send("Invalid password");
      } else {
        const payload = { username: username };
        const jwtToken = jwt.sign(payload, secret_token);
        res.send({ jwtToken });
      }
    }
  } catch (error) {
    console.log(error.message);
  }
});

// API - 3
// Getting the tweets of the users whom the user follows
app.get("/user/tweets/feed/", authenticateAccessToken, async (req, res) => {
  const user = await getUserByUserName(req.username);
  const userId = user.user_id;

  const getTweetsQuery = `SELECT  u.username, t.tweet, t.date_time
    FROM tweet t
    JOIN user u ON t.user_id = u.user_id
    WHERE t.user_id IN (
        SELECT following_user_id
        FROM follower
        WHERE follower_user_id = ?
    )
    ORDER BY t.date_time DESC
    LIMIT 4;`;
  let tweetsArr = await db.all(getTweetsQuery, userId);
  tweetsArr = tweetsArr.map((obj) => {
    return {
      ...obj,
      dateTime: obj.date_time,
      date_time: undefined,
    };
  });
  res.send(tweetsArr);
});

// API -- 4
// Get names of the people that user follows
app.get("/user/following/", authenticateAccessToken, async (req, res) => {
  const user = await getUserByUserName(req.username);
  const userId = user.user_id;

  const getNamesQuery = `SELECT u.name FROM 
  user u WHERE u.user_id IN (
      SELECT following_user_id FROM follower
      WHERE follower_user_id = ?
  );`;
  const userNamesArr = await db.all(getNamesQuery, userId);
  res.send(userNamesArr);
});

// API-5
// Get names of people who are following the user
app.get("/user/followers/", authenticateAccessToken, async (req, res) => {
  const user = await getUserByUserName(req.username);
  const userId = user.user_id;

  const getNamesQuery = `SELECT name FROM user
    WHERE user.user_id IN (
        SELECT follower_user_id FROM
        follower WHERE following_user_id = ?
    );`;
  const namesArr = await db.all(getNamesQuery, userId);
  res.send(namesArr);
});

// API-6
// Get the tweet, likes count, replies count and date-time from users that user follows
app.get("/tweets/:tweetId", authenticateAccessToken, async (req, res) => {
  const user = await getUserByUserName(req.username);
  const userId = user.user_id;
  let { tweetId } = req.params;
  tweetId = parseInt(tweetId);

  const tweetIdsQuery = `SELECT t.tweet_id FROM tweet t WHERE t.user_id IN (
      SELECT following_user_id FROM follower WHERE following_user_id = ?);`;

  const tweetIdObjArr = await db.all(tweetIdsQuery, userId);
  const tweetIdArr = tweetIdObjArr.map((obj) => obj.tweet_id);
  console.log(tweetIdArr);

  if (tweetIdArr.includes(tweetId)) {
    const getTweetsQuery = `SELECT t.tweet, COUNT(DISTINCT like_id) AS likes, COUNT(DISTINCT reply_id) AS replies, t.date_time AS dateTime 
            FROM tweet t
            JOIN like ON t.tweet_id = like.tweet_id 
            JOIN reply ON t.tweet_id = reply.tweet_id 
            WHERE t.tweet_id = ? 
            GROUP BY t.tweet_id 
            ORDER BY t.date_time DESC;`;
    let tweetObj = await db.get(getTweetsQuery, tweetId);
    res.send(tweetObj);
  } else {
    res.status(401);
    res.send("Invalid Request");
  }
});

// exporting the app object
module.exports = app;
