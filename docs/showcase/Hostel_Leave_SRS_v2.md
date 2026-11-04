# Hostel Leave Request System

## 1. Introduction

This document specifies a web application that lets hostel residents apply for leave online instead of filling in the paper register at the warden's office. A resident submits the dates and the reason, the warden approves or rejects the request, and the security desk sees the approved leaves for the day.

## Section 2 - User Roles

Residents apply for leave and see the status of their requests. Wardens approve or reject requests for their own block. Security staff see the list of residents who are on approved leave today.

## 3 Functional Requirement

3.1 A resident shall be able to apply for leave by entering the start date, the end date and a reason.

3.2 The warden of the resident's block shall approve or reject each request, with an optional note.

3.3 The resident shall receive a notification when the request is decided.

3.4 The security desk shall see every resident on approved leave for the current day.

3.5 Parents shall be informed automatically when leave longer than three days is approved.

## 4 Non-Functional Requirements

The leave form shall load within 2 seconds on the hostel Wi-Fi. The system shall support 300 residents applying in the same evening. Leave records shall be kept for one academic year.

## 5 Acceptance Criteria

The system is accepted when twenty residents submit leave requests during a one-week trial and every request is decided by the warden within one working day.

## 6 References

1. Sardar Patel Institute of Technology, Hostel Rules and Regulations, 2025.
2. IEEE Std 830-1998, Recommended Practice for Software Requirements Specifications.
