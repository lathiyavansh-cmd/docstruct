# Campus Lost and Found Portal

## Abstract

Items lost on campus are handed to the security office, where owners rarely find them. This project builds a portal where finders post found items with a photo and owners search and claim them.

## 1 Introduction

The security office keeps a paper register of found items. Students must visit in person to check it, and most items are never claimed.

## 2 Problem Statement

Make it easy for anyone on campus to report a found item and for the owner to find and claim it, with proof of ownership.

## 3 Literature Review

Commercial lost and found services are built for airports and hotels and charge per item. College portals described in student projects usually lack a claim check, so items can be collected by the wrong person. This project adds a security-approved claim step.

## 4 Proposed System

Finders post an item with a photo, category and the place it was found. Owners search by category and date, then submit a claim describing a detail only the owner would know. The security office approves claims and hands over the item.

## 5 Implementation

The portal is a React web app with an Express API and a PostgreSQL database. Photos are resized on upload and stored with the item record.

## 6 Results

During a three-week trial, 41 items were posted and 29 were returned to their owners, compared with 6 returned from the paper register in the same period last term.

## 7 Conclusion

The portal moves the lost and found register online and keeps the security office in control of hand-overs.

## 8 References

1. Sardar Patel Institute of Technology, Campus Security Procedures, 2025.
