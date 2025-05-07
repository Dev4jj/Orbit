
async function getFriendsList(db, myid){
    try{
              const friendResults = await db.query(`
                SELECT users.first_name, users.username, users.id
                FROM friends fr
                JOIN users ON fr.user2_id = users.id
                WHERE fr.user1_id = $1;
              `, [myid]);
          
              return friendResults.rows;
            } catch (error) {
              console.error('Error fetching friends list:', error);
             return [];
}}

export default getFriendsList;