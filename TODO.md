# Project TODO List

This document outlines the next major steps for developing the Discord Social Credit application.

## Core Functionality

1.  **User Authentication & Discord Integration**
    *   [ ] Implement Discord OAuth2 for user login.
    *   [ ] Securely store user Discord ID and access/refresh tokens on the backend.
    *   [ ] Fetch basic user profile information (username, avatar) from Discord API upon login and display it.

2.  **Server Management & User Selection**
    *   [ ] **Option A: Automatic Server Discovery**
        *   [ ] After login, fetch the list of servers the authenticated user is a member of via the Discord API.
        *   [ ] Allow the user to select which of their servers they want to track in the application.
    *   [ ] **Option B: Manual Server Addition (Consider if needed alongside or instead of A)**
        *   [ ] Allow users to manually input Server IDs to track.
    *   [ ] For a selected server, fetch the list of users in that server from the Discord API.
    *   [ ] Allow the authenticated user to select which *other* users from that server they want to track social credit for.
    *   [ ] Persist server selections and tracked user relationships in the database.

3.  **Social Credit Tracking & Updates**
    *   [ ] Develop frontend UI elements for the logged-in user to submit social credit score updates (e.g., +/- buttons, input field for score delta, optional reason).
    *   [ ] Ensure these UI actions call the backend API endpoint (`POST /users/{acting_user_id}/credit/{target_user_id}`) with the correct data.
    *   [ ] Modify the frontend graph to dynamically display the logged-in user's scores for their selected target users, based on data fetched from the backend (e.g., `GET /users/{user_id}/credit/given`).
    *   [ ] Implement functionality to refresh user lists for a server.

## Backend Enhancements

*   [ ] Integrate MongoDB for persistent data storage, replacing the current in-memory mock data.
    *   [ ] Define final MongoDB schemas for users, servers, and score histories.
    *   [ ] Update all backend API endpoints to use MongoDB for CRUD operations.
*   [ ] Add more robust error handling and validation to API endpoints.

## Frontend Enhancements

*   [ ] Refine UI/UX for a more polished and intuitive experience.
*   [ ] Implement loading states and error handling for API calls.
*   [ ] Consider state management solutions (e.g., Redux Toolkit, Zustand, Context API improvements) as the application grows.
*   [ ] Implement drag-and-drop reordering for the server list (e.g., using react-beautiful-dnd or Dnd Kit).

## Future Considerations / Advanced Features

*   [ ] Real-time updates (e.g., using WebSockets) for score changes.
*   [ ] Displaying scores *received by* the logged-in user from others.
*   [ ] Notifications for significant score changes.
*   [ ] More advanced graph customization and filtering options. 