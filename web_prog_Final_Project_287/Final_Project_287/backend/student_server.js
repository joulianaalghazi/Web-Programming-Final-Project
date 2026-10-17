

const express = require("express");
const cors = require("cors");

// MySQL connection
const db = require("./student_db");

// Routes
const assessmentRoutes = require("./student_routes/student_assessmentRoutes");
const authRoutes = require("./student_routes/student_authRoutes");
const professorAuthRoutes = require("./student_routes/professor_authRoutes.js");
const professorCoursesRoutes = require("./student_routes/professor_coursesRoutes");
const studentCoursesRoutes = require("./student_routes/student_coursesRoutes");
const professorAssessmentRoutes = require("./student_routes/professor_assessmentRoutes");
const professorDashboardRoutes = require("./student_routes/professor_dashboardRoutes");
const professorTemplateRoutes = require("./student_routes/professor_templateRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/courses", professorCoursesRoutes);
app.use("/student/courses", studentCoursesRoutes);
app.use("/assessments", assessmentRoutes);
app.use("/student", authRoutes);
app.use("/professor", professorAuthRoutes);
app.use("/professor/assessments", professorAssessmentRoutes);
app.use("/professor/dashboard", professorDashboardRoutes);
app.use("/professor/templates", professorTemplateRoutes);
// Test route
app.get("/", (req, res) => {
  res.send("API is running");
});

// Start server
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});