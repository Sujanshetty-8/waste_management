import qrcode
import os

# The NGROK URL is no longer needed here, as the web app will handle it.

def generate_qr(house_id, output_dir="qrcodes"):
    """
    Generates a QR code containing only the house_id.
    """
    # Create the output directory if it doesn't exist
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    # The data for the QR code is just the ID, e.g., "H001"
    qr_data = house_id
    
    qr = qrcode.make(qr_data)
    file_path = os.path.join(output_dir, f"{house_id}.png")
    qr.save(file_path)
    print(f"QR code generated for {house_id}: {file_path}")

# --- Main execution ---
if __name__ == "__main__":
    # Generate QR codes for houses H001 to H100
    for i in range(1,101):
        house_id = f"H{str(i).zfill(3)}"
        generate_qr(house_id)
    
    print("\nFinished generating all QR codes.")
