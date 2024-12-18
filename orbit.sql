CREATE DATABASE orbit;

USE orbit;

CREATE TABLE IF NOT EXISTS users( 
id SERIAL PRIMARY KEY,
first_name VARCHAR(50) NOT NULL,
username VARCHAR(50) NOT NULL UNIQUE,
password VARCHAR(100) NOT NULL,
bio TEXT
);


CREATE TABLE IF NOT EXISTS posts(
id SERIAL PRIMARY KEY,
user_id INT NOT NULL,
content TEXT NOT NULL,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS comments(
    id SERIAL PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    comment TEXT NOT NULL,
    comment_username VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR PRIMARY KEY,     
  sess JSONB,                      
  expire TIMESTAMP WITH TIME ZONE NOT NULL
);