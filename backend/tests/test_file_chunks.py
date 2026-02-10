import pytest
from unittest.mock import patch
from uuid import uuid4

def create_test_secret(client, token):
    response = client.post(
        "/secrets",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": f"Test Chunk Secret {uuid4()}",
            "type": "file",
            "encrypted_data": "{\"file_name\":\"test.bin\",\"mime_type\":\"application/octet-stream\",\"total_chunks\":2}",
            "encrypted_key": "mock_key"
        }
    )
    assert response.status_code == 200
    return response.json()

class TestFileChunks:
    def test_upload_chunk_success(self, client, user1):
        token, _ = user1
        auth_headers = {"Authorization": f"Bearer {token}"}
        
        # 1. Create a secret
        secret = create_test_secret(client, token)
        secret_id = secret["id"]

        # 2. Upload Chunk 0
        chunk_0 = {
            "secret_id": secret_id,
            "chunk_index": 0,
            "iv": "iv_hex_0",
            "encrypted_data": "encrypted_hex_0"
        }
        res0 = client.post("/secrets/chunks", headers=auth_headers, json=chunk_0)
        assert res0.status_code == 201
        assert res0.json()["chunk_index"] == 0

        # 3. Upload Chunk 1
        chunk_1 = {
            "secret_id": secret_id,
            "chunk_index": 1,
            "iv": "iv_hex_1",
            "encrypted_data": "encrypted_hex_1"
        }
        res1 = client.post("/secrets/chunks", headers=auth_headers, json=chunk_1)
        assert res1.status_code == 201

    def test_list_chunks(self, client, user1):
        token, _ = user1
        auth_headers = {"Authorization": f"Bearer {token}"}
        
        secret = create_test_secret(client, token)
        secret_id = secret["id"]

        # Upload 2 chunks
        for i in range(2):
            client.post("/secrets/chunks", headers=auth_headers, json={
                "secret_id": secret_id, "chunk_index": i, "iv": f"iv_{i}", "encrypted_data": f"data_{i}"
            })

        # List
        res = client.get(f"/secrets/{secret_id}/chunks", headers=auth_headers)
        assert res.status_code == 200
        chunks = res.json()
        assert len(chunks) == 2
        
        # Sort chunks by index to ensure order
        chunks.sort(key=lambda x: x["chunk_index"])
        
        assert chunks[0]["chunk_index"] == 0
        assert chunks[1]["chunk_index"] == 1
        assert chunks[0]["encrypted_data"] == "data_0"

    def test_get_chunk(self, client, user1):
        token, _ = user1
        auth_headers = {"Authorization": f"Bearer {token}"}
        
        secret = create_test_secret(client, token)
        secret_id = secret["id"]

        # Upload
        client.post("/secrets/chunks", headers=auth_headers, json={
            "secret_id": secret_id, "chunk_index": 0, "iv": "iv_0", "encrypted_data": "data_0"
        })

        # Get
        res = client.get(f"/secrets/{secret_id}/chunks/0", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["chunk_index"] == 0
        assert data["encrypted_data"] == "data_0"

    def test_upload_chunk_not_owner_fails(self, client, user1, user2):
        token1, _ = user1
        token2, _ = user2
        user2_headers = {"Authorization": f"Bearer {token2}"}

        # User 1 creates secret
        secret = create_test_secret(client, token1)
        secret_id = secret["id"]

        # User 2 tries to upload to User 1's secret
        res = client.post("/secrets/chunks", headers=user2_headers, json={
            "secret_id": secret_id, "chunk_index": 0, "iv": "idx", "encrypted_data": "data"
        })
        assert res.status_code == 403

    def test_get_chunk_access_control(self, client, user1, user2):
        token1, _ = user1
        auth_headers = {"Authorization": f"Bearer {token1}"}
        
        token2, _ = user2
        user2_headers = {"Authorization": f"Bearer {token2}"}

        # User 1 creates secret + uploads chunk
        secret = create_test_secret(client, token1)
        secret_id = secret["id"]
        client.post("/secrets/chunks", headers=auth_headers, json={
            "secret_id": secret_id, "chunk_index": 0, "iv": "iv", "encrypted_data": "data"
        })

        # User 2 tries to read
        res = client.get(f"/secrets/{secret_id}/chunks/0", headers=user2_headers)
        assert res.status_code == 403

        # User 1 shares with User 2
        share_res = client.post("/secrets/share", headers=auth_headers, json={
            "secret_id": secret_id,
            "grantee_address": "pqc_test_user_" + "b" * 100, # Matches TEST_USER_ADDRESS_2 in conftest
            "encrypted_key": "shared_key"
        })
        assert share_res.status_code == 200

        # User 2 tries again -> Success
        res2 = client.get(f"/secrets/{secret_id}/chunks/0", headers=user2_headers)
        assert res2.status_code == 200
        assert res2.json()["encrypted_data"] == "data"

    def test_delete_secret_removes_chunks(self, client, user1):
        token, _ = user1
        auth_headers = {"Authorization": f"Bearer {token}"}
        
        # Create + Upload
        secret = create_test_secret(client, token)
        secret_id = secret["id"]
        client.post("/secrets/chunks", headers=auth_headers, json={
            "secret_id": secret_id, "chunk_index": 0, "iv": "iv", "encrypted_data": "data"
        })

        # Verify chunk exists
        res = client.get(f"/secrets/{secret_id}/chunks/0", headers=auth_headers)
        assert res.status_code == 200

        # Delete Secret
        del_res = client.delete(f"/secrets/{secret_id}", headers=auth_headers)
        assert del_res.status_code == 200

        # Verify chunk gone (cascade delete)
        res2 = client.get(f"/secrets/{secret_id}/chunks/0", headers=auth_headers)
        assert res2.status_code == 404

    def test_upload_file_too_large(self, client, user1):
        """Verify that uploading chunks exceeding MAX_TOTAL_FILE_SIZE fails."""
        token, _ = user1
        auth_headers = {"Authorization": f"Bearer {token}"}
        secret = create_test_secret(client, token)
        secret_id = secret["id"]

        # Mock the config limit to be very small (e.g., 10 bytes)
        with patch("config.MAX_TOTAL_FILE_SIZE", 10):
            # 1. Upload small chunk (ok)
            # encrypted_data is hex string. 10 chars hex = 5 bytes.
            res1 = client.post("/secrets/chunks", headers=auth_headers, json={
                "secret_id": secret_id, "chunk_index": 0, "iv": "iv", "encrypted_data": "0011223344"
            })
            assert res1.status_code == 201

            # 2. Upload another chunk that pushes total over 10 bytes
            # Existing = 5 bytes. New 20 chars hex = 10 bytes. Total 15 > 10.
            res2 = client.post("/secrets/chunks", headers=auth_headers, json={
                "secret_id": secret_id, "chunk_index": 1, "iv": "iv", "encrypted_data": "00112233445566778899"
            })
            assert res2.status_code == 413
            assert "too large" in res2.json()["detail"].lower()
