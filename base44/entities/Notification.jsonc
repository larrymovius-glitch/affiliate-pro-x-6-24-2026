{
  "name": "Notification",
  "type": "object",
  "properties": {
    "user_id": {
      "type": "string",
      "description": "The user this notification is for"
    },
    "type": {
      "type": "string",
      "enum": [
        "payout_completed",
        "post_published",
        "milestone",
        "veteran_status",
        "general"
      ],
      "default": "general"
    },
    "title": {
      "type": "string"
    },
    "body": {
      "type": "string"
    },
    "link_to": {
      "type": "string",
      "description": "Optional in-app path to navigate to when this notification is tapped"
    },
    "read": {
      "type": "boolean",
      "default": false
    }
  },
  "required": [
    "user_id",
    "title"
  ],
  "rls": {
    "create": {},
    "read": {
      "user_id": "{{user.id}}"
    },
    "update": {
      "user_id": "{{user.id}}"
    },
    "delete": {
      "user_id": "{{user.id}}"
    }
  }
}
