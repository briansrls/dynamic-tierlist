# Discord Social Credit Tracker

This project aims to create a system for tracking "social credit" scores between users within Discord servers.

## Features

*   Select Discord servers to track.
*   Import and refresh user lists from selected servers.
*   Track social credit scores between users over time.
*   Visualize scores on a logarithmic graph with user profile pictures and details on hover.

## Project Structure

*   `/frontend`: Contains the frontend application code.
*   `/backend`: Contains the backend API and database logic.

## Prerequisites

*   Node.js and npm (or yarn) for the frontend.
*   Python 3.7+ and pip for the backend.

## Running the Project

To get the application running locally, you'll need to start both the backend server and the frontend development server.

**Important:** Make sure you have MongoDB installed and running before starting the backend. You can typically start it with a command like:
```
docker start mongo-dev
```

### Backend (FastAPI)

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```
2.  **Create and activate a Python virtual environment:**
    ```bash
    python3 -m venv venv  # Or python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```
3.  **Install Python dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
4.  **Run the FastAPI development server:**
    ```bash
    uvicorn main:app --reload --port 8000
    ```
    The backend API will be available at `http://localhost:8000`.
    Interactive API documentation (Swagger UI) will be at `http://localhost:8000/docs`.

### Frontend (React)

1.  **Navigate to the frontend directory:**
    ```bash
    cd frontend
    ```
2.  **Install Node.js dependencies:**
    ```bash
    npm install  # Or yarn install
    ```
3.  **Start the React development server:**
    ```bash
    npm start  # Or yarn start
    ```
    The frontend application will typically open automatically in your browser at `http://localhost:3000`.

Once both are running, you can access the application in your web browser (usually at the frontend URL, `http://localhost:3000`). 