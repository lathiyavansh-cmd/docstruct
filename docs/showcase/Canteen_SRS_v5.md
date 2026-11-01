# Campus Canteen Pre-Order System

## 1 Introduction

This document specifies the requirements for a web application that lets students and staff order food from the campus canteen before they arrive.  Orders are prepared in advance and collected at a pickup counter, which shortens queues during the lunch break.

## 2 Users

Students place orders and collect them. Canteen staff accept orders, prepare them and mark them ready. The canteen manager maintains the menu and reviews daily sales.

## 3 Functional Requirements

### 3.1 Menu

The system shall display the menu for the current day with the price and calorie count of every item.

### 3.2 Ordering

A student shall be able to add items to a cart and place an order for a chosen pickup slot.

Pickup slots are fifteen minutes long and each slot accepts at most 80 orders.

The system shall send the student a notification when the order is ready for pickup.

### 3.3 Order Management

Canteen staff shall see incoming orders sorted by pickup slot.

Staff will mark each order as preparing, ready or collected from a tablet at the counter, and an order left uncollected for thirty minutes is moved to a separate list for the manager.

### 3.4 Payments

The system shall accept payment by UPI before an order is confirmed.

Refunds for cancelled orders are not processed automatically; the manager approves each refund (see Section 3.4).

## 4 Non-Functional Requirements

The menu page should load within 3 seconds on a college Wi-Fi connection.

The system shall support 500 users placing orders at the same time.

## 5 Acceptance Criteria

The system is accepted when ten students complete an order end to end without help and the canteen staff confirm that orders arrive in pickup-slot order.

## 6 References

1. Sardar Patel Institute of Technology, Canteen Operations Handbook, 2025.
2. IEEE Std 830-1998, Recommended Practice for Software Requirements Specifications.
3. National Payments Corporation of India, UPI Product Overview, 2024.
