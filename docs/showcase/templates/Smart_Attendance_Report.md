# Smart Attendance Using QR Codes

## 1. Abstract

Paper attendance takes about ten minutes of every lecture and is easy to fake. This project replaces it with a QR code that the teacher shows on the projector and students scan from their phones. The code changes every 20 seconds, so a photo sent to a friend outside the room stops working almost at once.

## Chapter 2 Introduction

Teachers at the institute take attendance on paper sheets that are later typed into a spreadsheet. The process is slow, error-prone and gives students no way to check their own record during the term.

## 2.1 Problem Statement

Design a system that records attendance in under a minute per lecture, resists proxy attendance, and lets every student see their attendance percentage at any time.

## 3. Literature Review

Earlier systems used RFID cards, which need a reader in every room, and face recognition, which needs good cameras and raises privacy concerns. Rotating QR codes need nothing but the projector already in the room and the students' own phones.

## 4. Proposed System

The teacher starts a session from a web page. The page shows a QR code that encodes the session and a time window. A student scans it with the app, which sends the code, the student's ID and the phone's location to the server.

## 5. Implementation

The server is written in Node.js with a PostgreSQL database. Each QR code carries a signed token valid for 20 seconds. Scans outside the time window, or more than 50 metres from the classroom, are rejected.

## 6. Results

In a two-week trial with three classes of 60 students, attendance took 48 seconds on average instead of 9 minutes. No proxy scans were accepted once the location check was turned on.

## 7. Conclusion

Rotating QR codes made attendance faster and harder to fake without any new hardware. The next step is integration with the institute's student portal.

## 8. References

1. IEEE, "QR code based attendance systems: a survey", 2022.
2. Sardar Patel Institute of Technology, Academic Rules for Attendance, 2025.
