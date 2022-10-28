"use strict";

const C = {
	STATUS_ACTIVE: 1,
	STATUS_INACTIVE: 0,
	STATUS_DELETED: -1,

	ROLE_SYSTEM: "$system",
	ROLE_EVERYONE: "$everyone",
	ROLE_AUTHENTICATED: "$authenticated",
	ROLE_MEMBER: "$member",
	ROLE_OWNER: "$owner",
	ROLE_APP_MEMBER: "$app-member",
	ROLE_APP_OWNER: "$app-owner",
	ROLE_ADDON_MEMBER: "$addon-member",
	ROLE_ADDON_OWNER: "$addon-owner",
	ROLE_ADMINISTRATOR: "administrator",
	ROLE_USER: "user",

	VISIBILITY_PRIVATE: "private",
	VISIBILITY_PROTECTED: "protected",
	VISIBILITY_PUBLIC: "public",
	VISIBILITY_PUBLISHED: "published",

	TOKEN_TYPE_VERIFICATION: "verification",
	TOKEN_TYPE_PASSWORDLESS: "passwordless",
	TOKEN_TYPE_PASSWORD_RESET: "password-reset",
	TOKEN_TYPE_API_KEY: "api-key"
};

module.exports = {
	...C,

	TOKEN_TYPES: [
		C.TOKEN_TYPE_VERIFICATION,
		C.TOKEN_TYPE_PASSWORDLESS,
		C.TOKEN_TYPE_PASSWORD_RESET,
		C.TOKEN_TYPE_API_KEY
	],

	DEFAULT_LABELS: [
		{ id: 1, name: "Low priority", color: "#fad900" },
		{ id: 2, name: "Medium priority", color: "#ff9f19" },
		{ id: 3, name: "High priority", color: "#eb4646" }
	],

	TIMESTAMP_FIELDS: {
		createdAt: {
			type: "number",
			readonly: true,
			onCreate: () => Date.now(),
			graphql: { type: "Long" }
		},
		updatedAt: {
			type: "number",
			readonly: true,
			onUpdate: () => Date.now(),
			graphql: { type: "Long" }
		},
		deletedAt: {
			type: "number",
			readonly: true,
			hidden: "byDefault",
			onRemove: () => Date.now(),
			graphql: { type: "Long" }
		}
	},

	ARCHIVED_FIELDS: {
		archived: { type: "boolean", readonly: true, default: false },
		archivedAt: { type: "number", readonly: true, graphql: { type: "Long" } }
	}
};