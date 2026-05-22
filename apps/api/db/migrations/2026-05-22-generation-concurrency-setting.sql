INSERT INTO app_settings (setting_key, setting_value, value_type, category, is_secret, description)
VALUES
  ('generation.imageConcurrency', '10', 'number', 'generation', 0, 'Maximum concurrent image generation jobs')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
