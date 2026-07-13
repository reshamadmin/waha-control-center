-- Migration to add template_body column to broadcasts table
ALTER TABLE `broadcasts`
  ADD COLUMN `template_body` TEXT DEFAULT NULL AFTER `status`;
