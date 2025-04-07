document.addEventListener("DOMContentLoaded", function() {

    document.body.addEventListener("click", function(e) {

        //toggle cards
        if (e.target.matches(".toggle-signup")) {
            e.preventDefault();
            document.querySelector(".log-card").classList.add("d-none");
            document.querySelector(".sign-card").classList.remove("d-none");
        }
        if (e.target.matches(".toggle-login")) {
            e.preventDefault();
            document.querySelector(".sign-card").classList.add("d-none");
            document.querySelector(".log-card").classList.remove("d-none");
        }

        //show or hide password
        if((e.target.matches(".show-sign")) || (e.target.matches(".show-log"))){
            const signbox = document.querySelector(".show-sign");
            const signPass = document.getElementById("signpassword");

            const logbox = document.querySelector(".show-log");
            const logPass = document.getElementById("logpassword");

            if(signbox.checked){
                signPass.type = 'text';
            }else{
                signPass.type = 'password';
            }

            if(logbox.checked){
                logPass.type = 'text';
            }else{
                logPass.type = 'password';
            }

        }

        //deleting account

        if (e.target.matches("#confirmDlt")) {
            const dltInput = prompt("Deleting your account is a permanent action, please confirm by typing YES:");
            if (dltInput === "YES") {
                console.log("Account deletion in progress.");
                
                // Make a POST request to delete the account
                fetch("/delete-account", {
                    method: "POST",
                    headers: {
                        'Content-Type': 'application/json',
                    }, 
                    body: JSON.stringify({ confirmed: true }),
                }).then(response => {
                    if (response.ok) {
                        console.log("Account deleted successfully.");
                        window.location.href = '/logout'; 
                    } else {
                        console.log("Error deleting account.");
                    }
                }).catch(error => {
                    console.error("Error:", error);
                });
            } else {
                console.log("Account deletion canceled.");
            }
        }

        //users page user list - requests toggle

        if(e.target.matches('#user-btn')){

            document.querySelector('#user-btn').classList.add('active');
            document.querySelector('#req-btn').classList.remove('active');
            
            document.querySelector(".req-list").classList.add('d-none');
            document.querySelector(".user-list").classList.remove("d-none");

        }else if(e.target.matches('#req-btn')){

            document.querySelector('#req-btn').classList.add('active');
            document.querySelector('#user-btn').classList.remove('active');

            document.querySelector(".user-list").classList.add('d-none');
            document.querySelector(".req-list").classList.remove("d-none");
        }

    });
    //basic form validation checks

    document.getElementById("signForm").addEventListener("submit", function(e){

    let username = document.getElementById("signusername").value;
    let password = document.getElementById("signpassword").value;

    if(username.length < 4){
        e.preventDefault();
        alert("Username must be at least 4 characters long.");
    }
    else if(password.length < 4){
        e.preventDefault();
        alert("Password must be at least 4 characters long.");
    }else if (username == password){
        e.preventDefault();
        alert("Username can not be the same as the passoword.");
    }
    }
    );

    
//post form handling
document.getElementById('postForm').addEventListener('submit', function (e){
if(e.target.matches('#postBtn')){
    e.preventDefault();
const postContent = document.getElementById('myMsg').value;
const isFriend = document.getElementById('isFriend').checked;

const postInfo = {
    content: postContent,
 isFriend: isFriend,
};

fetch('/posts', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(postInfo),
})
.then(response => response.json())
.then(data => {
    console.log('Post created successfully:', data);
})
.catch(error => {
    console.error('Error creating post:', error);
});
}})


    //users page btns 
    //fix functionality
    const userReqBtns = document.querySelectorAll('.user-req-btn');

    userReqBtns.forEach(button => {
        button.addEventListener('click', () => {
            
            userReqBtns.forEach(btn => btn.classList.remove('active'));
        
            button.classList.add('active');
        });
    });

    /*
    document.getElementById("search-input").addEventListener("input", function() {
        let filter = this.value.toLowerCase(); // Get the value of the input and convert it to lowercase
        let friends = document.querySelectorAll("#friendsList .user-msg-list"); // Get all the friend list items
    
        friends.forEach(function(friend) {
            let friendName = friend.querySelector(".friend-name").textContent.toLowerCase(); // Get the friend's name and username
            if (friendName.indexOf(filter) > -1) {
                friend.style.display = ""; // Show the friend if the name matches the filter
            } else {
                friend.style.display = "none"; // Hide the friend if the name doesn't match the filter
            }
        });
    });*/


});