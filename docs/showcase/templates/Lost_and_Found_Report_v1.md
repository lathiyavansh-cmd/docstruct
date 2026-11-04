# Campus Lost and Found Portal

## Abstract

Items lost on campus are handed to the security office, where owners rarely find them. This project builds a portal where finders post found items with a photo and owners search and claim them.

## 1 Introduction

The security office keeps a paper register of found items. Students must visit in person to check it, and most items are never claimed.

## 2 Problem Statement

Make it easy for anyone on campus to report a found item and for the owner to find and claim it, with proof of ownership.

## 3 Proposed System

Finders post an item with a photo, category and the place it was found. Owners search by category and date, then submit a claim describing a detail only the owner would know. The security office approves claims and hands over the item.

## 4 Implementation

The portal is a React web app with an Express API and a PostgreSQL database. Photos are resized on upload and stored with the item record.

## 5 Conclusion

The portal moves the lost and found register online and keeps the security office in control of hand-overs.

## 6 References

1. Sardar Patel Institute of Technology, Campus Security Procedures, 2025.
