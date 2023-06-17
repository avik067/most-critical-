const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());

let db = null;

//////////////
const listenAndinitializeDb = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server is running at  : http://localhost:3000/");
    });
  } catch (err) {
    console.log(`DB Error :${err.message}`);
    process.exit(1);
  }
};
listenAndinitializeDb();

// GET
app.post("/register/", async (request, response) => {
  const { username, password, gender, name } = request.body;

  const dbUser = await db.get(
    `SELECT * FROM user WHERE username = '${username}'`
  );

  if (dbUser === undefined) {
    if (password.length >= 6) {
      const hashedPass = await bcrypt.hash(password, 10);
      await db.run(
        ` INSERT INTO user (username ,password,  gender , name) VALUES ('${username}' ,'${hashedPass}' , '${gender}' , '${name}')`
      );

      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// GET all
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const dbUser = await db.get(
    `SELECT * FROM user WHERE username = '${username}' ;`
  );
  if (dbUser !== undefined) {
    const isMatch = await bcrypt.compare(password, dbUser.password);
    if (isMatch) {
      let jwtToken = jwt.sign(username, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

function authentication(request, response, next) {
  let jwtToken;
  const authorization = request.headers["authorization"];
  if (authorization !== undefined) {
    jwtToken = authorization.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload;
        next();
      }
    });
  }
}

const tweetResponse = (dbObject) => ({
  username: dbObject.username,
  tweet: dbObject.tweet,
  dateTime: dbObject.date_time,
});

// user tweets api

app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const latestTweets = await db.all(`
    SELECT 
    tweet.tweet_id ,
    tweet.user_id ,
    user.username,
    tweet.tweet,
    tweet.date_time
    FROM 
    follower
    LEFT JOIN tweet on tweet.user_id = follower.following_user_id
    LEFT JOIN user on follower.following_user_id =user.user_id
    WHERE follower.follower_user_id = (SELECT user_id FROM user WHERE username = '${request.username}')
    ORDER BY tweet.date_time desc
    LIMIT 4  ;
    `);
  response.send(latestTweets.map((item) => tweetResponse(item)));
});

// all the people who __ following
app.get("/user/following/", authentication, async (request, response) => {
  const following = await db.all(
    `
SELECT 
user.name
FROM 
follower
LEFT JOIN user ON follower.following_user_id = user.user_id
WHERE follower.follower_user_id = (SELECT user_id FROM user WHERE username = '${request.username}') ;
`
  );
  response.send(following);
});

// get all the followers of the logged

app.get("/user/followers/", authentication, async (request, response) => {
  const followers = await db.all(`
       SELECT 
       user.name
       FROM 
       follower
       LEFT JOIN user on follower.follower_user_id = user.user_id 
       WHERE follower.following_user_id = (SELECT user_id FROM user WHERE username = '${request.username}') ;
    `);
  response.send(followers);
});
/////////////////////
const follows = async (request, response, next) => {
  const { tweetId } = request.params;
  let isFollowing = await db.get(`
    SELECT * FROM follower 
    WHERE 
    follower_user_id = (SELECT user_id FROM user WHERE username = '${request.username}')
    AND 
    follower_user_id = (SELECT user.user_id FROM tweet NATURAL JOIN user WHERE tweet_id = '${tweetId}') ;
  `);
  if (isFollowing === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

// GET tweet with tweet id
app.get(
  "/tweets/:tweetId/",
  authentication,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;
    const { tweet, date_time } = await db.get(`
    SELECT tweet,date_time FROM tweet WHERE tweet_id = ${tweetId}
    `);
    const { likes } = await db.get(`
    SELECT COUNT(like_id) AS likes FROM like WHERE tweet_id = ${tweetId} ;
    `);
    const { replies } = await db.get(`
    SELECT COUNT(reply_id) AS replies FROM reply WHERE tweet_id  =${tweetId} ;
    `);
  }
);

// GET all likes of a tweet with tweet id if the user follows the tweeter

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;
    const likedBy = await db.all(`
    SELECT user.username FROM 
    like NATURAL JOIN user
    WHERE tweet_id =${tweetId} ;

    `);
    response.send({ likes: likedBy.map((item) => item.username) });
  }
);

//

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;
    const replies = await db.all(`
 SELECT user.name , reply.reply FROM reply NATURAL JOIN user WHERE tweet_id = ${tweetID} ;
 
 `);
    response.send({ replies });
  }
);

//get all the tweet by the logged user
app.get("/user/tweets/", authentication, async (request, response) => {
  const myTweets = await db.all(`
    SELECT 
    tweet.tweet ,
    count(distinct like.like_id )  as likes ,
    count(distinct reply.reply_id) as replies,
    tweet.date_time
    FROM 
    tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    LEFT JOIN  reply on tweet.tweet_id = reply.tweet_id
    WHERE tweet.user_id = (SELECT user_id FROM user WHERE username = '${request.username}')
    group by tweet.tweet_id ;
    `);

  response.send(
    myTweets.map((item) => {
      const { date_time, ...rest } = item;
      return { ...rest, dateTime: date_time };
    })
  );
});

// POST
app.post("/user/tweets/", authentication, async (request, response) => {
  const { tweet } = request.body;
  const { user_id } = await db.get(
    `SELECT user_id FROM user WHERE username = '${request.username}'`
  );
  await db.run(`
    INSERT INTO tweet 
    (tweet , user_id)
    VALUES 
    ('${tweet}' , '${user_id}') ; 
    `);
  response.send("Created a Tweet");
});

// DELETE

app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const userTweet = await db.get(
    `SELECT tweet_id , user_id  FROM tweet WHERE tweet_id = ${tweetId} 
        AND user_id = ( SELECT user_id FROM user WHERE username = '${request.username}' );
        `
  );
  if (userTweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    await db.run(`DELETE FROM tweet 
        WHERE tweet_id = ${tweetId}
        `);
    response.send("Tweet Removed");
  }
});

module.exports = listenAndinitializeDb;
module.exports = app;
