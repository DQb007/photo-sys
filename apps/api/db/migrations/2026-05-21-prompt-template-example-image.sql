ALTER TABLE prompt_templates
  ADD COLUMN example_image_url VARCHAR(1000) NULL AFTER prompt_text;
